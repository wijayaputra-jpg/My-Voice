import React, { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Download, Pause, Play, Search, Trash2, Volume2 } from "lucide-react";
import { EMOTION_PRESETS } from "../constants/emotionsAndPacing";
import { EmotionId, SynthesisTake } from "../types/voice";
import { base64ToBlobUrl } from "../utils/audioEngine";

interface TakeHistoryViewProps {
  takes: SynthesisTake[];
  onLoadTakeIntoStudio: (take: SynthesisTake) => void;
  onDeleteTake: (takeId: string) => Promise<void>;
  onGoToStudio: () => void;
}

export const TakeHistoryView: React.FC<TakeHistoryViewProps> = ({
  takes,
  onLoadTakeIntoStudio,
  onDeleteTake,
  onGoToStudio,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [emotionFilter, setEmotionFilter] = useState<"all" | EmotionId>("all");
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const filteredTakes = useMemo(() => {
    return takes.filter((take) => {
      const matchesEmotion = emotionFilter === "all" || take.emotionId === emotionFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        take.script.toLowerCase().includes(q) ||
        take.voiceProfileName.toLowerCase().includes(q) ||
        take.emotionLabel.toLowerCase().includes(q);
      return matchesEmotion && matchesQuery;
    });
  }, [takes, emotionFilter, searchQuery]);

  const handleTogglePlay = async (take: SynthesisTake) => {
    if (playingTakeId === take.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingTakeId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }

    const url = base64ToBlobUrl(take.masteredWavBase64, "audio/wav");
    blobUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onended = () => {
      setPlayingTakeId(null);
    };

    await audio.play();
    setPlayingTakeId(take.id);
  };

  const handleDownloadTake = (take: SynthesisTake) => {
    const url = base64ToBlobUrl(take.masteredWavBase64, "audio/wav");
    const link = document.createElement("a");
    link.href = url;
    link.download = `voxforma-${take.emotionId}-${take.speedMultiplier.toFixed(2)}x-${take.id.slice(-5)}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Generated Voice Takes</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Audition, filter by emotional tone, export 24 kHz WAV masters, or reload any take into
            the synthesis studio.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scripts or tones..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
          />
        </div>
      </div>

      {/* Emotion Filter Bar */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto my-5">
        <button
          type="button"
          onClick={() => setEmotionFilter("all")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            emotionFilter === "all"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          All Tones ({takes.length})
        </button>
        {EMOTION_PRESETS.map((em) => (
          <button
            key={em.id}
            type="button"
            onClick={() => setEmotionFilter(em.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              emotionFilter === em.id
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {em.label.split("&")[0].trim()}
          </button>
        ))}
      </div>

      {filteredTakes.length === 0 ? (
        <div className="py-14 text-center">
          <Volume2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-800">
            {takes.length === 0
              ? "No generated voice takes yet"
              : "No takes match your current filter"}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {takes.length === 0
              ? "Synthesize your first script in the Studio to build an archive of emotional takes."
              : "Clear your search query or select All Tones above."}
          </p>
          {takes.length === 0 && (
            <button
              type="button"
              onClick={onGoToStudio}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Open Synthesis Studio
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-3 pr-4 w-12">Play</th>
                <th className="py-3 px-4">Script Excerpt & Voice</th>
                <th className="py-3 px-4">Emotional Tone</th>
                <th className="py-3 px-4 text-right">Pace & WPM</th>
                <th className="py-3 px-4 text-right">Duration</th>
                <th className="py-3 pl-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredTakes.map((take) => {
                const isPlaying = playingTakeId === take.id;
                return (
                  <tr key={take.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 pr-4 align-middle">
                      <button
                        type="button"
                        onClick={() => handleTogglePlay(take)}
                        aria-label={isPlaying ? "Pause take" : "Play take"}
                        className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                          isPlaying
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                        }`}
                      >
                        {isPlaying ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5 ml-0.5" />
                        )}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 align-middle max-w-md">
                      <p className="text-sm font-medium text-slate-900 truncate">{take.script}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span>{take.voiceProfileName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {new Date(take.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                      <div className="text-xs font-medium text-slate-800">{take.emotionLabel}</div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        {take.emotionIntensity}% depth
                      </div>
                    </td>
                    <td className="py-3.5 px-4 align-middle text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-xs font-medium text-slate-900">
                        {take.speedMultiplier.toFixed(2)}x
                      </div>
                      <div className="text-xs text-slate-500">{take.effectiveWpm} WPM</div>
                    </td>
                    <td className="py-3.5 px-4 align-middle text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                      {take.durationSec.toFixed(1)}s
                    </td>
                    <td className="py-3.5 pl-4 align-middle text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onLoadTakeIntoStudio(take)}
                          title="Load script & settings into Studio"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          Reload
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadTake(take)}
                          aria-label="Download WAV"
                          className="inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTake(take.id)}
                          aria-label="Delete take"
                          className="inline-flex items-center justify-center w-8 h-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
