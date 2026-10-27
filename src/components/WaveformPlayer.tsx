import React, { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, Repeat, RotateCcw } from "lucide-react";
import { base64ToBlobUrl } from "../utils/audioEngine";

interface WaveformPlayerProps {
  wavBase64: string;
  peaks: number[];
  title: string;
  subtitle: string;
  downloadFilename: string;
  referenceWavBase64?: string | null;
  referencePeaks?: number[];
}

function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00.0";
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  const wholeSec = Math.floor(rem);
  const tenths = Math.floor((rem - wholeSec) * 10);
  return `${String(mins).padStart(2, "0")}:${String(wholeSec).padStart(2, "0")}.${tenths}`;
}

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  wavBase64,
  peaks,
  title,
  subtitle,
  downloadFilename,
  referenceWavBase64,
  referencePeaks,
}) => {
  const [compareMode, setCompareMode] = useState<"synthesized" | "reference">("synthesized");
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);

  const activeBase64 =
    compareMode === "reference" && referenceWavBase64 ? referenceWavBase64 : wavBase64;
  const activePeaks =
    compareMode === "reference" && referencePeaks && referencePeaks.length > 0
      ? referencePeaks
      : peaks;

  useEffect(() => {
    setCompareMode("synthesized");
  }, [wavBase64]);

  useEffect(() => {
    if (!activeBase64) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
    }

    const blobUrl = base64ToBlobUrl(activeBase64, "audio/wav");
    urlRef.current = blobUrl;

    const audio = new Audio(blobUrl);
    audio.loop = loop;
    audioRef.current = audio;
    setIsPlaying(false);
    setCurrentTime(0);

    const onLoaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [activeBase64]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = loop;
    }
  }, [loop]);

  useEffect(() => {
    const tick = () => {
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 640;
    const height = rect.height || 76;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const bars = activePeaks.length > 0 ? activePeaks : Array.from({ length: 80 }, () => 0.15);
    const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

    const gap = 2.5;
    const barWidth = Math.max(2, (width - gap * (bars.length - 1)) / bars.length);
    const centerY = height / 2;

    for (let i = 0; i < bars.length; i++) {
      const x = i * (barWidth + gap);
      const barRatio = i / bars.length;
      const amp = Math.max(0.07, Math.min(1, bars[i]));
      const barHeight = Math.max(4, amp * (height - 12));
      const y = centerY - barHeight / 2;

      if (barRatio <= progress) {
        ctx.fillStyle = compareMode === "reference" ? "#0F172A" : "#2563EB";
      } else {
        ctx.fillStyle = "#CBD5E1";
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      ctx.fill();
    }

    // Playhead line
    const playheadX = Math.min(width - 1, Math.max(1, progress * width));
    ctx.fillStyle = compareMode === "reference" ? "#0F172A" : "#1D4ED8";
    ctx.fillRect(playheadX - 0.75, 2, 1.5, height - 4);
  }, [activePeaks, currentTime, duration, compareMode]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (audio.ended || (duration > 0 && audio.currentTime >= duration - 0.05)) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      await audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleRestart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
  };

  const handleScrub = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * duration;
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const handleDownload = () => {
    if (!urlRef.current) return;
    const link = document.createElement("a");
    link.href = urlRef.current;
    link.download = downloadFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {referenceWavBase64 && (
            <div
              role="group"
              aria-label="Audio source comparison"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              <button
                type="button"
                onClick={() => setCompareMode("synthesized")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  compareMode === "synthesized"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Generated Voice
              </button>
              <button
                type="button"
                onClick={() => setCompareMode("reference")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  compareMode === "reference"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                My Original Sample
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Download className="w-3.5 h-3.5" />
            Export WAV
          </button>
        </div>
      </div>

      <div className="relative select-none">
        <canvas
          ref={canvasRef}
          onClick={handleScrub}
          className="w-full h-20 cursor-pointer rounded-lg bg-slate-50/70"
          aria-label="Interactive audio waveform scrubber"
        />
      </div>

      <div className="flex items-center justify-between gap-4 mt-3.5 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause playback" : "Play audio"}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 shrink-0"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={handleRestart}
            aria-label="Restart from beginning"
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setLoop((prev) => !prev)}
            aria-label="Toggle loop playback"
            aria-pressed={loop}
            className={`inline-flex items-center justify-center w-10 h-10 rounded-lg transition-colors shrink-0 ${
              loop
                ? "bg-blue-50 text-blue-600"
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-600">
          <span className="text-slate-900 font-medium">{formatTimecode(currentTime)}</span>
          <span aria-hidden="true">/</span>
          <span>{formatTimecode(duration)}</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="text-slate-500">24.0 kHz 16-bit PCM</span>
        </div>
      </div>
    </div>
  );
};
