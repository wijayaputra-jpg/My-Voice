import { AcousticMetrics } from "../types/voice";

const TARGET_SAMPLE_RATE = 24000;

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.split(",")[1] : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToBlobUrl(base64: string, mimeType = "audio/wav"): string {
  const bytes = base64ToUint8Array(base64);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

export function encodeMonoWavBytes(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): Uint8Array {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, Math.round(int16), true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function trimAndNormalizeSamples(input: Float32Array, sampleRate: number): Float32Array {
  if (input.length === 0) return input;

  const threshold = 0.006; // ~ -44 dBFS
  const padSamples = Math.floor(sampleRate * 0.1);
  let start = 0;
  let end = input.length - 1;

  while (start < input.length && Math.abs(input[start]) < threshold) {
    start++;
  }
  while (end > start && Math.abs(input[end]) < threshold) {
    end--;
  }

  start = Math.max(0, start - padSamples);
  end = Math.min(input.length - 1, end + padSamples);

  const trimmed = input.slice(start, end + 1);
  let peak = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const abs = Math.abs(trimmed[i]);
    if (abs > peak) peak = abs;
  }

  if (peak > 0.001) {
    const targetPeak = 0.85;
    const scale = targetPeak / peak;
    for (let i = 0; i < trimmed.length; i++) {
      trimmed[i] = Math.max(-1, Math.min(1, trimmed[i] * scale));
    }
  }

  return trimmed;
}

export async function decodeBlobToMono24k(blob: Blob): Promise<{
  samples: Float32Array;
  wavBase64: string;
  durationSec: number;
}> {
  const arrayBuf = await blob.arrayBuffer();
  const tempCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await tempCtx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    await tempCtx.close();
  }

  const outLength = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, outLength, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);

  const rendered = await offline.startRendering();
  const rawMono = rendered.getChannelData(0);
  const normalized = trimAndNormalizeSamples(rawMono, TARGET_SAMPLE_RATE);
  const wavBytes = encodeMonoWavBytes(normalized, TARGET_SAMPLE_RATE);

  return {
    samples: normalized,
    wavBase64: uint8ArrayToBase64(wavBytes),
    durationSec: normalized.length / TARGET_SAMPLE_RATE,
  };
}

export function computeWaveformPeaks(samples: Float32Array, barCount = 100): number[] {
  if (samples.length === 0) {
    return Array.from({ length: barCount }, () => 0.08);
  }

  const peaks: number[] = [];
  const blockSize = Math.max(1, Math.floor(samples.length / barCount));
  let maxPeak = 0.001;

  for (let b = 0; b < barCount; b++) {
    const start = b * blockSize;
    const end = Math.min(samples.length, start + blockSize);
    let sumSq = 0;
    let localMax = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]);
      sumSq += v * v;
      if (v > localMax) localMax = v;
    }
    const rms = end > start ? Math.sqrt(sumSq / (end - start)) : 0;
    const blended = rms * 0.65 + localMax * 0.35;
    peaks.push(blended);
    if (blended > maxPeak) maxPeak = blended;
  }

  return peaks.map((p) => Math.max(0.06, Math.min(1, p / maxPeak)));
}

function radix2FFT(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angleStep = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const angle = angleStep * k;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const idx1 = i + k;
        const idx2 = idx1 + half;
        const tre = real[idx2] * cos - imag[idx2] * sin;
        const tim = real[idx2] * sin + imag[idx2] * cos;
        real[idx2] = real[idx1] - tre;
        imag[idx2] = imag[idx1] - tim;
        real[idx1] += tre;
        imag[idx1] += tim;
      }
    }
  }
}

export function analyzeVoiceSamples(
  samples: Float32Array,
  sampleRate = TARGET_SAMPLE_RATE
): AcousticMetrics {
  const durationSec = samples.length / sampleRate;
  const frameSize = 1024; // ~42.6ms at 24kHz
  const hopSize = 480; // 20ms hop
  const minLag = Math.floor(sampleRate / 360); // 360 Hz max human F0
  const maxLag = Math.floor(sampleRate / 72); // 72 Hz min human F0

  let peakRms = 0.001;
  const frameRmsList: number[] = [];
  for (let pos = 0; pos + frameSize <= samples.length; pos += hopSize) {
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = samples[pos + i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / frameSize);
    frameRmsList.push(rms);
    if (rms > peakRms) peakRms = rms;
  }

  const f0Candidates: number[] = [];
  let centroidNumerator = 0;
  let centroidDenominator = 0;
  let lowMidEnergy = 0;
  let highMidEnergy = 0;

  const fftReal = new Float32Array(frameSize);
  const fftImag = new Float32Array(frameSize);

  let frameIdx = 0;
  for (let pos = 0; pos + frameSize <= samples.length; pos += hopSize) {
    const rms = frameRmsList[frameIdx++];
    if (rms < peakRms * 0.22) continue;

    // Zero-crossing check to focus on voiced vowel nuclei
    let zcr = 0;
    for (let i = 1; i < frameSize; i++) {
      if ((samples[pos + i] >= 0) !== (samples[pos + i - 1] >= 0)) {
        zcr++;
      }
    }
    const zcrRatio = zcr / frameSize;

    if (zcrRatio < 0.24) {
      // Normalized autocorrelation pitch estimation
      let bestCorr = 0;
      let bestLag = 0;
      const corrValues = new Float32Array(maxLag + 2);

      let energy0 = 0;
      for (let i = 0; i < frameSize - maxLag; i++) {
        energy0 += samples[pos + i] * samples[pos + i];
      }

      if (energy0 > 1e-6) {
        for (let lag = minLag; lag <= maxLag; lag++) {
          let sum = 0;
          let energyLag = 0;
          const len = frameSize - maxLag;
          for (let i = 0; i < len; i++) {
            const a = samples[pos + i];
            const b = samples[pos + i + lag];
            sum += a * b;
            energyLag += b * b;
          }
          const denom = Math.sqrt(energy0 * energyLag);
          const corr = denom > 1e-8 ? sum / denom : 0;
          corrValues[lag] = corr;
          if (corr > bestCorr) {
            bestCorr = corr;
            bestLag = lag;
          }
        }

        if (bestCorr > 0.58 && bestLag > minLag && bestLag < maxLag) {
          // Parabolic lag refinement
          const y1 = corrValues[bestLag - 1];
          const y2 = corrValues[bestLag];
          const y3 = corrValues[bestLag + 1];
          const denom = y1 - 2 * y2 + y3;
          const delta = Math.abs(denom) > 1e-6 ? (0.5 * (y1 - y3)) / denom : 0;
          const refinedLag = bestLag + Math.max(-0.5, Math.min(0.5, delta));
          const hz = sampleRate / refinedLag;
          if (hz >= 75 && hz <= 350) {
            f0Candidates.push(hz);
          }
        }
      }
    }

    // Spectral centroid & warmth analysis using Hann-windowed 1024-pt FFT
    for (let i = 0; i < frameSize; i++) {
      const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
      fftReal[i] = samples[pos + i] * hann;
      fftImag[i] = 0;
    }
    radix2FFT(fftReal, fftImag);

    const halfBins = frameSize >> 1;
    const binHz = sampleRate / frameSize;
    for (let b = 2; b < halfBins; b++) {
      const freq = b * binHz;
      if (freq > 7500) break;
      const mag = Math.hypot(fftReal[b], fftImag[b]);
      centroidNumerator += freq * mag;
      centroidDenominator += mag;
      if (freq >= 90 && freq <= 500) {
        lowMidEnergy += mag;
      } else if (freq >= 1400 && freq <= 5200) {
        highMidEnergy += mag;
      }
    }
  }

  f0Candidates.sort((a, b) => a - b);
  const f0Hz =
    f0Candidates.length > 0
      ? Math.round(f0Candidates[Math.floor(f0Candidates.length * 0.5)])
      : 146;
  const f0MinHz =
    f0Candidates.length > 3
      ? Math.round(f0Candidates[Math.floor(f0Candidates.length * 0.15)])
      : Math.max(80, f0Hz - 22);
  const f0MaxHz =
    f0Candidates.length > 3
      ? Math.round(f0Candidates[Math.floor(f0Candidates.length * 0.85)])
      : f0Hz + 28;

  const spectralCentroidHz =
    centroidDenominator > 0 ? Math.round(centroidNumerator / centroidDenominator) : 1680;
  const warmthRatio =
    highMidEnergy > 0
      ? Math.round((lowMidEnergy / (lowMidEnergy + highMidEnergy)) * 100) / 100
      : 0.55;

  // Estimate natural speaking rate (WPM) from smoothed syllable nuclei peaks
  const smoothedEnv = new Float32Array(frameRmsList.length);
  for (let i = 0; i < frameRmsList.length; i++) {
    let acc = 0;
    let count = 0;
    for (let k = -2; k <= 2; k++) {
      const idx = i + k;
      if (idx >= 0 && idx < frameRmsList.length) {
        acc += frameRmsList[idx];
        count++;
      }
    }
    smoothedEnv[i] = count > 0 ? acc / count : 0;
  }

  let syllablePeaks = 0;
  let voicedFrames = 0;
  const syllableFloor = peakRms * 0.2;
  let lastPeakIdx = -6;

  for (let i = 1; i < smoothedEnv.length - 1; i++) {
    if (smoothedEnv[i] > peakRms * 0.12) {
      voicedFrames++;
    }
    if (
      smoothedEnv[i] > syllableFloor &&
      smoothedEnv[i] > smoothedEnv[i - 1] &&
      smoothedEnv[i] >= smoothedEnv[i + 1] &&
      i - lastPeakIdx >= 5 // at least 100ms between syllable nuclei
    ) {
      syllablePeaks++;
      lastPeakIdx = i;
    }
  }

  const activeSpeechSec = Math.max(1.2, (voicedFrames * hopSize) / sampleRate);
  const syllablesPerSec = syllablePeaks / activeSpeechSec;
  const estimatedWpm = Math.round((syllablesPerSec * 60) / 1.48);
  const measuredWpm = Math.max(105, Math.min(188, estimatedWpm || 142));

  return {
    f0Hz,
    f0MinHz,
    f0MaxHz,
    spectralCentroidHz,
    warmthRatio,
    measuredWpm,
    durationSec: Math.round(durationSec * 10) / 10,
    waveformPeaks: computeWaveformPeaks(samples, 100),
  };
}

/**
 * Artifact-free WSOLA (Waveform Similarity Overlap-Add) time-scale modification.
 * Preserves exact vocal pitch and formants while changing speech speed.
 * speedRatio > 1.0 = faster speech; speedRatio < 1.0 = slower speech.
 */
export function wsolaTimeStretch(
  input: Float32Array,
  speedRatio: number,
  sampleRate = TARGET_SAMPLE_RATE
): Float32Array {
  if (Math.abs(speedRatio - 1.0) < 0.015 || input.length < 2048) {
    return input;
  }

  const clampedSpeed = Math.max(0.55, Math.min(1.85, speedRatio));
  const winSize = Math.floor(sampleRate * 0.03); // 30ms Hann window (720 samples @ 24k)
  const halfWin = winSize >> 1; // 50% synthesis hop Hs = 360
  const searchRadius = Math.floor(sampleRate * 0.01); // ±10ms correlation search
  const outLength = Math.max(winSize, Math.round(input.length / clampedSpeed));

  const output = new Float32Array(outLength + winSize);
  const norm = new Float32Array(outLength + winSize);
  const hann = new Float32Array(winSize);
  for (let i = 0; i < winSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  let synPos = 0;
  let prevBestInPos = 0;

  // Copy first grain
  for (let i = 0; i < winSize && i < input.length; i++) {
    output[i] += input[i] * hann[i];
    norm[i] += hann[i];
  }
  synPos += halfWin;

  while (synPos + winSize < outLength) {
    const targetInPos = Math.round(synPos * clampedSpeed);
    const naturalNextPos = prevBestInPos + halfWin;

    let bestOffset = 0;
    if (
      naturalNextPos + halfWin < input.length &&
      targetInPos - searchRadius >= 0 &&
      targetInPos + searchRadius + winSize < input.length
    ) {
      let maxCorr = -Infinity;
      // Compare overlap region with natural continuation of previous grain
      const step = 2; // 2-sample stride for fast real-time responsiveness
      for (let delta = -searchRadius; delta <= searchRadius; delta += step) {
        const candPos = targetInPos + delta;
        let corr = 0;
        for (let k = 0; k < halfWin; k += 2) {
          corr += input[naturalNextPos + k] * input[candPos + k];
        }
        if (corr > maxCorr) {
          maxCorr = corr;
          bestOffset = delta;
        }
      }
    }

    const chosenInPos = Math.max(
      0,
      Math.min(input.length - winSize - 1, targetInPos + bestOffset)
    );
    prevBestInPos = chosenInPos;

    for (let i = 0; i < winSize; i++) {
      const w = hann[i];
      output[synPos + i] += input[chosenInPos + i] * w;
      norm[synPos + i] += w;
    }

    synPos += halfWin;
  }

  const finalOut = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    finalOut[i] = norm[i] > 1e-4 ? output[i] / norm[i] : 0;
  }
  return finalOut;
}

function resampleLinear(input: Float32Array, factor: number): Float32Array {
  if (Math.abs(factor - 1.0) < 0.005) return input;
  const outLen = Math.max(1, Math.round(input.length / factor));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * factor;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = srcIdx - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Studio Acoustic Mastering Chain:
 * Applies optional pitch-preserving tempo pacing, subtle F0 pitch alignment,
 * and 3-band vocal EQ (Low-cut 65Hz, Warmth 220Hz, Presence 3.6kHz) -> 24kHz WAV.
 */
export async function masterVoiceAudio(options: {
  rawWavBase64: string;
  extraTempoRatio?: number;
  pitchSemitones?: number;
  warmthDb?: number;
  presenceDb?: number;
}): Promise<{
  masteredWavBase64: string;
  durationSec: number;
  waveformPeaks: number[];
}> {
  const {
    rawWavBase64,
    extraTempoRatio = 1.0,
    pitchSemitones = 0,
    warmthDb = 0,
    presenceDb = 0,
  } = options;

  const wavBytes = base64ToUint8Array(rawWavBase64);
  const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: "audio/wav" });
  const arrayBuf = await blob.arrayBuffer();

  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    await decodeCtx.close();
  }

  const sampleRate = TARGET_SAMPLE_RATE;
  const resampledLen = Math.max(1, Math.ceil(decoded.duration * sampleRate));
  const prepCtx = new OfflineAudioContext(1, resampledLen, sampleRate);
  const prepSrc = prepCtx.createBufferSource();
  prepSrc.buffer = decoded;
  prepSrc.connect(prepCtx.destination);
  prepSrc.start(0);
  const mono24k = (await prepCtx.startRendering()).getChannelData(0);

  // Pitch shift by `pitchSemitones` while achieving net tempo `extraTempoRatio`:
  // Resampling by `pitchFactor` shifts pitch by `pitchFactor` and speeds up by `pitchFactor`.
  // So WSOLA pre-stretches by `extraTempoRatio / pitchFactor` first!
  const pitchFactor = Math.pow(2, pitchSemitones / 12);
  const wsolaRatio = extraTempoRatio / pitchFactor;

  let processed: Float32Array = Float32Array.from(mono24k);
  if (Math.abs(wsolaRatio - 1.0) >= 0.015) {
    processed = wsolaTimeStretch(processed, wsolaRatio, sampleRate);
  }
  if (Math.abs(pitchFactor - 1.0) >= 0.005) {
    processed = resampleLinear(processed, pitchFactor);
  }

  // Apply 3-band studio vocal EQ via OfflineAudioContext if warmth or presence is non-zero
  if (Math.abs(warmthDb) >= 0.1 || Math.abs(presenceDb) >= 0.1) {
    const eqCtx = new OfflineAudioContext(1, Math.max(1, processed.length), sampleRate);
    const audioBuf = eqCtx.createBuffer(1, Math.max(1, processed.length), sampleRate);
    audioBuf.getChannelData(0).set(processed);

    const source = eqCtx.createBufferSource();
    source.buffer = audioBuf;

    const highpass = eqCtx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 68;
    highpass.Q.value = 0.707;

    const warmthFilter = eqCtx.createBiquadFilter();
    warmthFilter.type = "peaking";
    warmthFilter.frequency.value = 225;
    warmthFilter.Q.value = 0.9;
    warmthFilter.gain.value = warmthDb;

    const presenceFilter = eqCtx.createBiquadFilter();
    presenceFilter.type = "peaking";
    presenceFilter.frequency.value = 3650;
    presenceFilter.Q.value = 1.1;
    presenceFilter.gain.value = presenceDb;

    source.connect(highpass);
    highpass.connect(warmthFilter);
    warmthFilter.connect(presenceFilter);
    presenceFilter.connect(eqCtx.destination);
    source.start(0);

    const eqRendered = await eqCtx.startRendering();
    processed = Float32Array.from(eqRendered.getChannelData(0));
  }

  // Soft-knee peak limiter so EQ boosts never clip
  let maxAbs = 0;
  for (let i = 0; i < processed.length; i++) {
    const v = Math.abs(processed[i]);
    if (v > maxAbs) maxAbs = v;
  }
  if (maxAbs > 0.94) {
    const gain = 0.92 / maxAbs;
    for (let i = 0; i < processed.length; i++) {
      processed[i] *= gain;
    }
  }

  const outWavBytes = encodeMonoWavBytes(processed, sampleRate);
  return {
    masteredWavBase64: uint8ArrayToBase64(outWavBytes),
    durationSec: Math.round((processed.length / sampleRate) * 10) / 10,
    waveformPeaks: computeWaveformPeaks(processed, 110),
  };
}
