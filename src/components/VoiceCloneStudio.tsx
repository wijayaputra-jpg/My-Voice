import React, { useEffect, useRef, useState } from "react";
import { Check, Mic, Square, Trash2, Upload, Volume2 } from "lucide-react";
import { CALIBRATION_SCRIPTS } from "../constants/emotionsAndPacing";
import { AcousticMetrics, VoiceProfile } from "../types/voice";
import { analyzeVoiceSamples, decodeBlobToMono24k } from "../utils/audioEngine";
import { WaveformPlayer } from "./WaveformPlayer";

interface VoiceCloneStudioProps {
  profiles: VoiceProfile[];
  mainProfile: VoiceProfile | null;
  onSaveProfile: (profile: VoiceProfile) => Promise<void>;
  onSelectMainProfile: (profileId: string) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onCompleteRedirect?: () => void;
}

export const VoiceCloneStudio: React.FC<VoiceCloneStudioProps> = ({
  profiles,
  mainProfile,
  onSaveProfile,
  onSelectMainProfile,
  onDeleteProfile,
  onCompleteRedirect,
}) => {
  const [selectedScriptIdx, setSelectedScriptIdx] = useState(0);
  const [profileName, setProfileName] = useState(
    profiles.length === 0 ? "My Main Voice" : `My Voice Take ${profiles.length + 1}`
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordElapsedSec, setRecordElapsedSec] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const [capturedWavB64, setCapturedWavB64] = useState<string | null>(null);
  const [capturedMetrics, setCapturedMetrics] = useState<AcousticMetrics | null>(null);
  const [isAnalyzingLocal, setIsAnalyzingLocal] = useState(false);
  const [isEnrollingServer, setIsEnrollingServer] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const oscAnimRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cleanupRecordingResources = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (oscAnimRef.current) {
      cancelAnimationFrame(oscAnimRef.current);
      oscAnimRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
    };
  }, []);

  const drawLiveOscilloscope = () => {
    const canvas = liveCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLen = analyser.fftSize;
    const timeData = new Uint8Array(bufferLen);

    const renderFrame = () => {
      if (!analyserRef.current || !liveCanvasRef.current) return;
      analyserRef.current.getByteTimeDomainData(timeData);

      const dpr = window.devicePixelRatio || 1;
      const rect = liveCanvasRef.current.getBoundingClientRect();
      const w = rect.width || 560;
      const h = rect.height || 88;
      if (
        liveCanvasRef.current.width !== Math.round(w * dpr) ||
        liveCanvasRef.current.height !== Math.round(h * dpr)
      ) {
        liveCanvasRef.current.width = Math.round(w * dpr);
        liveCanvasRef.current.height = Math.round(h * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Center reference hairline
      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Live voice waveform
      ctx.strokeStyle = "#2563EB";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sliceWidth = w / bufferLen;
      let x = 0;
      for (let i = 0; i < bufferLen; i++) {
        const v = (timeData[i] - 128) / 128;
        const y = h / 2 + v * (h * 0.42);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();

      oscAnimRef.current = requestAnimationFrame(renderFrame);
    };

    oscAnimRef.current = requestAnimationFrame(renderFrame);
  };

  const processRecordedOrUploadedBlob = async (blob: Blob) => {
    setIsAnalyzingLocal(true);
    setEnrollError(null);
    try {
      const { samples, wavBase64, durationSec } = await decodeBlobToMono24k(blob);
      if (durationSec < 2.0) {
        setEnrollError(
          "Voice sample is shorter than 2 seconds. Please record or upload at least 5–15 seconds of clear speech."
        );
        setIsAnalyzingLocal(false);
        return;
      }
      const metrics = analyzeVoiceSamples(samples, 24000);
      setCapturedWavB64(wavBase64);
      setCapturedMetrics(metrics);
    } catch (err: unknown) {
      setEnrollError(
        err instanceof Error
          ? `Could not decode audio file: ${err.message}`
          : "Unable to process audio file. Please try WAV, MP3, or M4A."
      );
    } finally {
      setIsAnalyzingLocal(false);
    }
  };

  const handleStartRecording = async () => {
    setMicError(null);
    setEnrollError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const recordedBlob = new Blob(chunksRef.current, { type: mimeType });
        cleanupRecordingResources();
        setIsRecording(false);
        if (recordedBlob.size > 0) {
          await processRecordedOrUploadedBlob(recordedBlob);
        }
      };

      recorder.start(200);
      setIsRecording(true);
      setRecordElapsedSec(0);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        setRecordElapsedSec((Date.now() - startedAt) / 1000);
      }, 100);

      setTimeout(drawLiveOscilloscope, 40);
    } catch (err: unknown) {
      cleanupRecordingResources();
      setIsRecording(false);
      setMicError(
        err instanceof Error
          ? `Microphone access failed (${err.message}). Check browser microphone permissions or upload a voice audio file instead.`
          : "Microphone access was denied. You can allow mic access or upload an audio recording directly."
      );
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      cleanupRecordingResources();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMicError(null);
    await processRecordedOrUploadedBlob(file);
    e.target.value = "";
  };

  const handleEnrollVoiceModel = async () => {
    if (!capturedWavB64 || !capturedMetrics) return;
    setIsEnrollingServer(true);
    setEnrollError(null);

    try {
      const response = await fetch("/api/voice/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: capturedWavB64,
          consentAudioBase64: capturedWavB64,
          profileName: profileName.trim() || "My Main Voice",
          acousticMetrics: capturedMetrics,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to build voice model.");
      }

      const newProfile: VoiceProfile = {
        id: `vp_${Date.now()}`,
        name: profileName.trim() || "My Main Voice",
        isMain: true,
        createdAt: Date.now(),
        transcript: data.transcript,
        detectedLanguage: data.detectedLanguage,
        anchorVoice: data.anchorVoice,
        anchorBaseHz: data.anchorBaseHz || 148,
        vocalSummary: data.vocalSummary,
        personaPrompt: data.personaPrompt,
        timbreTraits: data.timbreTraits || [],
        naturalPaceDescriptor: data.naturalPaceDescriptor,
        replicationMode: data.replicationMode || "persona_dsp",
        customVoiceRef: data.customVoiceRef || null,
        metrics: capturedMetrics,
        tuning: {
          pitchSemitones: Number(data.recommendedPitchSemitones) || 0,
          warmthDb: Number(data.recommendedWarmthDb) || 0,
          presenceDb: 0.4,
          enableDspLock: true,
        },
        referenceWavBase64: capturedWavB64,
      };

      await onSaveProfile(newProfile);
      setCapturedWavB64(null);
      setCapturedMetrics(null);
      setProfileName(`My Voice Take ${profiles.length + 2}`);

      if (onCompleteRedirect) {
        onCompleteRedirect();
      }
    } catch (err: unknown) {
      setEnrollError(err instanceof Error ? err.message : "Voice enrollment failed.");
    } finally {
      setIsEnrollingServer(false);
    }
  };

  const activeScript = CALIBRATION_SCRIPTS[selectedScriptIdx];

  return (
    <div className="space-y-8">
      {/* Capture & Calibration Booth */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold text-slate-900">
              Capture & Calibrate Your Own Voice
            </h2>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              Record 10–20 seconds of natural speech in a quiet space or upload a clear voice
              recording. Voxforma extracts your fundamental pitch, formant warmth, natural WPM
              cadence, and vocal persona to set your voice as the studio’s main voice.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRecording || isEnrollingServer}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-4 h-4" />
              Upload Voice Audio
            </button>
          </div>
        </div>

        {/* Teleprompter Script Selector */}
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <span className="text-xs font-medium text-slate-700">
              Guided Calibration Script (or speak naturally in your own words)
            </span>
            <div
              role="tablist"
              aria-label="Calibration reading prompts"
              className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              {CALIBRATION_SCRIPTS.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedScriptIdx === idx}
                  onClick={() => setSelectedScriptIdx(idx)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    selectedScriptIdx === idx
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {idx === 0 ? "Recommended Consent" : idx === 1 ? "Conversational" : "Expressive"}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
              <span>{activeScript.title}</span>
              <span className="font-mono tabular-nums">Target: {activeScript.durationHint}</span>
            </div>
            <p className="text-base sm:text-lg font-medium text-slate-900 leading-relaxed">
              “{activeScript.text}”
            </p>
          </div>
        </div>

        {/* Live Microphone Recorder Controls */}
        <div className="mt-6 pt-6 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={handleStartRecording}
                  disabled={isEnrollingServer || isAnalyzingLocal}
                  className="inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <Mic className="w-4 h-4" />
                  {capturedWavB64 ? "Record Again" : "Start Recording My Voice"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop Capture ({recordElapsedSec.toFixed(1)}s)
                </button>
              )}

              <div className="text-xs text-slate-500">
                {isRecording ? (
                  <span className="font-medium text-red-600 font-mono tabular-nums">
                    Recording live microphone input · {recordElapsedSec.toFixed(1)}s
                  </span>
                ) : isAnalyzingLocal ? (
                  <span>Extracting 24 kHz acoustic fingerprint...</span>
                ) : (
                  <span>24.0 kHz mono PCM · Echo & noise filtering active</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="voice-profile-name" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                Voice Name
              </label>
              <input
                id="voice-profile-name"
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="My Main Voice"
                className="w-48 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {isRecording && (
            <div className="mt-4">
              <canvas
                ref={liveCanvasRef}
                className="w-full h-24 rounded-lg bg-slate-50 border border-slate-200"
              />
            </div>
          )}

          {micError && (
            <p role="alert" className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {micError}
            </p>
          )}

          {enrollError && (
            <p role="alert" className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {enrollError}
            </p>
          )}
        </div>

        {/* Captured Sample Preview + Acoustic Readout + Build Button */}
        {capturedWavB64 && capturedMetrics && !isRecording && (
          <div className="mt-6 pt-6 border-t border-slate-200 space-y-5">
            <WaveformPlayer
              wavBase64={capturedWavB64}
              peaks={capturedMetrics.waveformPeaks}
              title="Captured Reference Voice Sample"
              subtitle={`Duration ${capturedMetrics.durationSec}s · Fundamental ${capturedMetrics.f0Hz} Hz · Natural Pace ${capturedMetrics.measuredWpm} WPM`}
              downloadFilename="my-reference-voice-sample.wav"
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 px-5 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <div className="text-xs text-slate-500">Fundamental Pitch (F0)</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {capturedMetrics.f0Hz} Hz
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-500">
                  Range {capturedMetrics.f0MinHz}–{capturedMetrics.f0MaxHz} Hz
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Natural Cadence</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {capturedMetrics.measuredWpm} WPM
                </div>
                <div className="text-xs text-slate-500">1.00x studio baseline</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Spectral Centroid</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {capturedMetrics.spectralCentroidHz} Hz
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-500">
                  Warmth index {Math.round(capturedMetrics.warmthRatio * 100)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Sample Length</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {capturedMetrics.durationSec}s
                </div>
                <div className="text-xs text-slate-500">Ready for cloning</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCapturedWavB64(null);
                  setCapturedMetrics(null);
                }}
                disabled={isEnrollingServer}
                className="px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Discard Sample
              </button>
              <button
                type="button"
                onClick={handleEnrollVoiceModel}
                disabled={isEnrollingServer}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {isEnrollingServer
                  ? "Analyzing & Building Your Voice Model..."
                  : "Build & Set as My Main Voice"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Enrolled Personal Voice Profiles */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
        <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Enrolled Personal Voices</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Your active Main Voice drives every synthesis take across all emotional tones and
              custom pacing settings.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {profiles.length} {profiles.length === 1 ? "voice model" : "voice models"}
          </span>
        </div>

        {profiles.length === 0 ? (
          <div className="py-10 text-center">
            <Volume2 className="w-8 h-8 text-slate-300 mx-auto mb-2.5" />
            <p className="text-sm font-medium text-slate-800">No personal voice enrolled yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Record 10 seconds above or upload an audio clip of your voice to build your personal
              main voice model.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {profiles.map((vp) => {
              const isMain = mainProfile?.id === vp.id || vp.isMain;
              return (
                <div key={vp.id} className="py-5 first:pt-4 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5 max-w-2xl">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base font-semibold text-slate-900">{vp.name}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-xs font-medium text-blue-600">
                          {isMain ? "Active Main Voice" : "Saved Snapshot"}
                        </span>
                      </div>

                      <p className="text-sm text-slate-700 leading-relaxed">{vp.vocalSummary}</p>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                        <span>F0 {vp.metrics.f0Hz} Hz</span>
                        <span aria-hidden="true">·</span>
                        <span>Baseline {vp.metrics.measuredWpm} WPM</span>
                        <span aria-hidden="true">·</span>
                        <span>{vp.detectedLanguage}</span>
                        <span aria-hidden="true">·</span>
                        <span>{vp.timbreTraits.join(" / ")}</span>
                      </div>

                      {vp.transcript && (
                        <p className="text-xs text-slate-500 italic pt-1">
                          Calibration read: “{vp.transcript}”
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isMain && (
                        <button
                          type="button"
                          onClick={() => onSelectMainProfile(vp.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Set as Main Voice
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteProfile(vp.id)}
                        aria-label={`Delete ${vp.name}`}
                        className="inline-flex items-center justify-center w-9 h-9 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
