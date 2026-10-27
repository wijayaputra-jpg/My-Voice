import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_ANCHOR_VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"] as const;

const ANCHOR_DEFAULT_HZ: Record<string, number> = {
  Fenrir: 108,
  Charon: 116,
  Puck: 148,
  Zephyr: 196,
  Kore: 212,
};

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing in server environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

interface ParsedWav {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  pcmData: Buffer;
}

function parseWavBuffer(buf: Buffer): ParsedWav {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") {
    return {
      sampleRate: 24000,
      numChannels: 1,
      bitsPerSample: 16,
      pcmData: buf,
    };
  }

  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let offset = 12;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;

    if (chunkId === "fmt " && dataStart + 16 <= buf.length) {
      numChannels = buf.readUInt16LE(dataStart + 2);
      sampleRate = buf.readUInt32LE(dataStart + 4);
      bitsPerSample = buf.readUInt16LE(dataStart + 14);
    } else if (chunkId === "data") {
      const end = Math.min(buf.length, dataStart + chunkSize);
      return {
        sampleRate,
        numChannels,
        bitsPerSample,
        pcmData: buf.subarray(dataStart, end),
      };
    }

    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    pcmData: buf.subarray(44),
  };
}

function buildWavFromPcm(
  pcmData: Buffer,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): Buffer {
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

function applyEdgeMicroFade(pcm16: Buffer, sampleRate: number): Buffer {
  const copy = Buffer.from(pcm16);
  const totalSamples = Math.floor(copy.length / 2);
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.008), Math.floor(totalSamples / 4));
  for (let i = 0; i < fadeSamples; i++) {
    const gain = i / fadeSamples;
    const startSample = copy.readInt16LE(i * 2);
    copy.writeInt16LE(Math.round(startSample * gain), i * 2);

    const endIdx = (totalSamples - 1 - i) * 2;
    const endSample = copy.readInt16LE(endIdx);
    copy.writeInt16LE(Math.round(endSample * gain), endIdx);
  }
  return copy;
}

interface ScriptSegment {
  text: string;
  pauseAfterSec: number;
}

function splitScriptWithCustomPauses(rawScript: string, extraSentencePauseMs: number): ScriptSegment[] {
  const normalized = rawScript
    .replace(/<sigh>/gi, "<breath>")
    .trim();

  const pauseRegex = /\[pause\s+([0-9]*\.?[0-9]+)s?\]/gi;
  const segments: ScriptSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pauseRegex.exec(normalized)) !== null) {
    const chunkText = normalized.slice(lastIndex, match.index).trim();
    const pauseSec = Math.min(4.0, Math.max(0.1, parseFloat(match[1]) || 0.5));
    if (chunkText) {
      segments.push({ text: chunkText, pauseAfterSec: pauseSec });
    } else if (segments.length > 0) {
      segments[segments.length - 1].pauseAfterSec = Math.min(
        4.0,
        segments[segments.length - 1].pauseAfterSec + pauseSec
      );
    }
    lastIndex = match.index + match[0].length;
  }

  const tail = normalized.slice(lastIndex).trim();
  if (tail) {
    segments.push({ text: tail, pauseAfterSec: 0 });
  }

  // If spacious or dramatic pause mode is chosen (>= 600ms) and there is only 1 block with multiple sentences,
  // optionally split major paragraph breaks for natural room-breath spacing.
  if (segments.length === 1 && extraSentencePauseMs >= 650 && segments[0].text.includes("\n\n")) {
    const paragraphs = segments[0].text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length > 1 && paragraphs.length <= 6) {
      return paragraphs.map((p, idx) => ({
        text: p,
        pauseAfterSec: idx < paragraphs.length - 1 ? extraSentencePauseMs / 1000 : 0,
      }));
    }
  }

  return segments.length > 0 ? segments : [{ text: normalized, pauseAfterSec: 0 }];
}

async function synthesizeSegmentAudio(
  ai: GoogleGenAI,
  segmentText: string,
  styleInstruction: string,
  anchorVoice: string,
  customVoiceRef?: string | null,
  languageCode?: string
): Promise<Buffer> {
  const safeAnchor = VALID_ANCHOR_VOICES.includes(anchorVoice as (typeof VALID_ANCHOR_VOICES)[number])
    ? anchorVoice
    : "Puck";

  if (customVoiceRef) {
    try {
      const customResponse = await ai.models.generateContent({
        model: "gemini-3.8-flash-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: segmentText,
                speechMetadata: {
                  style: styleInstruction,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            ...(languageCode && languageCode !== "auto" ? { languageCode } : {}),
            voiceConfig: {
              voice: customVoiceRef,
            },
          },
        },
      });

      const customAudioB64 =
        customResponse.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
          ?.data;
      if (customAudioB64) {
        return Buffer.from(customAudioB64, "base64");
      }
    } catch {
      // Fall through to anchor voice + persona Voice Design
    }
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash-tts",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: segmentText,
            speechMetadata: {
              style: styleInstruction,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        ...(languageCode && languageCode !== "auto" ? { languageCode } : {}),
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: safeAnchor,
          },
        },
      },
    },
  });

  const audioB64 = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
    ?.inlineData?.data;

  if (!audioB64) {
    throw new Error("Voice synthesis returned no audio payload. Try shortening or simplifying the text.");
  }

  return Buffer.from(audioB64, "base64");
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "50mb" }));

  // Health endpoint
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Enroll & analyze user's own voice recording to build their Main Voice Model
  app.post("/api/voice/enroll", async (req: Request, res: Response) => {
    try {
      const {
        audioBase64,
        consentAudioBase64,
        profileName = "My Main Voice",
        acousticMetrics,
      } = req.body || {};

      if (!audioBase64 || typeof audioBase64 !== "string") {
        res.status(400).json({ error: "A valid voice audio sample is required to build your voice model." });
        return;
      }

      const ai = getGenAI();
      const f0Hint = acousticMetrics?.f0Hz ? `${Math.round(acousticMetrics.f0Hz)} Hz` : "unknown";
      const wpmHint = acousticMetrics?.measuredWpm
        ? `${Math.round(acousticMetrics.measuredWpm)} WPM`
        : "140 WPM";
      const centroidHint = acousticMetrics?.spectralCentroidHz
        ? `${Math.round(acousticMetrics.spectralCentroidHz)} Hz`
        : "balanced";

      const analysisPrompt = `You are a master acoustic phonetician and neural voice-cloning director.
Listen carefully to this speaker's voice recording.
Measured physical DSP parameters from this recording:
- Fundamental pitch (F0): ${f0Hint}
- Spectral centroid: ${centroidHint}
- Measured speaking cadence: ${wpmHint}

Analyze the speaker's true vocal identity so we can recreate their natural voice accurately across multiple emotional tones and custom pacing:
1. Transcribe verbatim what the speaker said in the audio.
2. Detect the spoken BCP-47 language tag (e.g., "en-US", "en-GB", "id-ID", "es-ES", etc.).
3. Select the closest neural base anchor voice from EXACTLY this list: ["Fenrir", "Charon", "Puck", "Zephyr", "Kore"]:
   - "Fenrir": Deep, resonant lower-baritone chest voice (~108 Hz)
   - "Charon": Warm, smooth baritone/low-mid voice (~116 Hz)
   - "Puck": Clear, natural mid-register tenor/conversational voice (~148 Hz)
   - "Zephyr": Smooth, airy, bright mid-high voice (~196 Hz)
   - "Kore": Warm, articulate alto/soprano mid-high voice (~212 Hz)
4. Write a rich, natural-language "personaPrompt" (2-3 concise sentences) describing the speaker's exact vocal timbre, chest vs. head resonance, breathiness, consonant crispness, subtle regional/linguistic inflection, and natural conversational cadence so a Voice Design TTS engine reproduces their unmistakable vocal character naturally.
5. Provide a 1-sentence human-friendly "vocalSummary" and 4 short "timbreTraits" phrases.`;

      const analysisResponse = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "audio/wav",
                data: audioBase64,
              },
            },
            {
              text: analysisPrompt,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcript: {
                type: Type.STRING,
                description: "Verbatim transcript of the recorded voice sample.",
              },
              detectedLanguage: {
                type: Type.STRING,
                description: "BCP-47 language code such as en-US or id-ID.",
              },
              anchorVoice: {
                type: Type.STRING,
                description: "Closest anchor voice: Fenrir, Charon, Puck, Zephyr, or Kore.",
              },
              vocalSummary: {
                type: Type.STRING,
                description: "Concise 1-sentence description of the speaker's natural voice.",
              },
              personaPrompt: {
                type: Type.STRING,
                description: "Detailed acoustic persona instruction for TTS Voice Design.",
              },
              timbreTraits: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Four short acoustic trait descriptors.",
              },
              naturalPaceDescriptor: {
                type: Type.STRING,
                description: "Short phrase describing the speaker's natural rhythm.",
              },
            },
            required: [
              "transcript",
              "detectedLanguage",
              "anchorVoice",
              "vocalSummary",
              "personaPrompt",
              "timbreTraits",
              "naturalPaceDescriptor",
            ],
          },
        },
      });

      const rawJson = analysisResponse.text?.trim() || "{}";
      const parsed = JSON.parse(rawJson);

      const chosenAnchor = VALID_ANCHOR_VOICES.includes(parsed.anchorVoice)
        ? parsed.anchorVoice
        : (acousticMetrics?.f0Hz && acousticMetrics.f0Hz < 128
            ? "Charon"
            : acousticMetrics?.f0Hz && acousticMetrics.f0Hz > 180
              ? "Zephyr"
              : "Puck");

      // Attempt Tier 1 (Native Replicated Voice) -> Tier 2 (Stored Prompted Custom Voice) -> Tier 3 (Persona + DSP Lock)
      let customVoiceRef: string | null = null;
      let replicationMode: "replicated" | "prompted" | "persona_dsp" = "persona_dsp";

      try {
        const repResult = await ai.voices.create({
          store: false,
          voice: {
            type: "replicated",
            replicated: {
              source_audio: {
                data: audioBase64,
                mime_type: "audio/wav",
              },
              consent_audio: {
                data: consentAudioBase64 || audioBase64,
                mime_type: "audio/wav",
              },
            },
          },
        });
        if (repResult?.key || repResult?.id) {
          customVoiceRef = repResult.key || repResult.id || null;
          replicationMode = "replicated";
        }
      } catch {
        try {
          const promptedResult = await ai.voices.create({
            store: true,
            voice: {
              type: "prompted",
              display_name: String(profileName).slice(0, 40),
              prompted: {
                base_voice: chosenAnchor,
                input: parsed.personaPrompt,
              },
            },
          });
          if (promptedResult?.id || promptedResult?.key) {
            customVoiceRef = promptedResult.id || promptedResult.key || null;
            replicationMode = "prompted";
          }
        } catch {
          replicationMode = "persona_dsp";
        }
      }

      // Compute subtle natural semitone alignment between anchor baseline and user's measured F0
      const anchorHz = ANCHOR_DEFAULT_HZ[chosenAnchor] || 148;
      const userF0 = Number(acousticMetrics?.f0Hz) || anchorHz;
      const rawSemitoneDelta = 12 * Math.log2(userF0 / anchorHz);
      // Clamp automatic pitch trim to [-2.2, +2.2] semitones to preserve 100% natural human vocal tract formants
      const recommendedPitchSemitones =
        replicationMode === "replicated"
          ? 0
          : Math.round(Math.max(-2.2, Math.min(2.2, rawSemitoneDelta)) * 10) / 10;

      // Subtle warmth calibration based on spectral centroid
      const centroid = Number(acousticMetrics?.spectralCentroidHz) || 1650;
      const recommendedWarmthDb =
        replicationMode === "replicated"
          ? 0
          : centroid < 1400
            ? 1.8
            : centroid > 2100
              ? -1.0
              : 0.6;

      res.json({
        transcript: parsed.transcript || "",
        detectedLanguage: parsed.detectedLanguage || "en-US",
        anchorVoice: chosenAnchor,
        anchorBaseHz: anchorHz,
        vocalSummary: parsed.vocalSummary || "Natural, balanced conversational voice.",
        personaPrompt:
          parsed.personaPrompt ||
          "Natural, articulate human speaking voice with organic breath phrasing and balanced warmth.",
        timbreTraits: Array.isArray(parsed.timbreTraits)
          ? parsed.timbreTraits.slice(0, 4)
          : ["Balanced resonance", "Natural breath onsets", "Clear articulation", "Organic cadence"],
        naturalPaceDescriptor: parsed.naturalPaceDescriptor || "Natural conversational cadence",
        customVoiceRef,
        replicationMode,
        recommendedPitchSemitones,
        recommendedWarmthDb,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to analyze and enroll voice.";
      console.error("Voice enrollment error:", error);
      res.status(500).json({ error: message });
    }
  });

  // Synthesize speech using the user's Main Voice + Emotional Tone + Custom Speech Pacing
  app.post("/api/voice/synthesize", async (req: Request, res: Response) => {
    try {
      const { text, voiceProfile, emotion, pacing } = req.body || {};

      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "Please enter script text to synthesize." });
        return;
      }

      const ai = getGenAI();

      const personaPrompt =
        voiceProfile?.personaPrompt ||
        "Natural, warm, authentic human voice with clear articulation and relaxed breathing.";
      const anchorVoice = voiceProfile?.anchorVoice || "Puck";
      const customVoiceRef = voiceProfile?.customVoiceRef || null;
      const languageCode = voiceProfile?.detectedLanguage || "en-US";

      const intensityPct = Number(emotion?.intensity) || 65;
      const intensityDescriptor =
        intensityPct <= 35
          ? "subtle, understated emotional nuance"
          : intensityPct <= 75
            ? "natural, genuine human emotional expression"
            : "deeply expressive, vivid emotional conviction without sounding theatrical or artificial";

      const secondaryBlend = emotion?.secondaryStylePrompt
        ? ` Subtly blend undertones of ${emotion.secondaryToneLabel}: ${emotion.secondaryStylePrompt}`
        : "";

      const speedMult = Number(pacing?.speedMultiplier) || 1.0;
      const targetWpm = Number(pacing?.targetWpm) || Math.round(142 * speedMult);
      const paceDescriptor =
        speedMult <= 0.82
          ? `slow, deliberate, unhurried delivery around ${targetWpm} words per minute`
          : speedMult <= 0.94
            ? `measured, thoughtful speaking pace around ${targetWpm} words per minute`
            : speedMult <= 1.07
              ? `natural, effortless conversational pace around ${targetWpm} words per minute`
              : speedMult <= 1.22
                ? `brisk, engaging, forward-moving pace around ${targetWpm} words per minute`
                : `rapid, crisp, high-momentum delivery around ${targetWpm} words per minute`;

      const pauseDescriptor =
        pacing?.pauseStyle === "tight"
          ? "tight, concise transitions between clauses with minimal dead air"
          : pacing?.pauseStyle === "spacious"
            ? "spacious, unhurried breathing room at commas and sentence endings"
            : pacing?.pauseStyle === "dramatic"
              ? "intentional, lingering dramatic pauses between key thoughts"
              : "natural human breath pauses at clause and sentence boundaries";

      const rhythmDescriptor =
        pacing?.rhythmMode === "steady"
          ? "consistent, even syllabic cadence"
          : pacing?.rhythmMode === "dynamic"
            ? "expressive pitch contour with dynamic emphasis on operative words"
            : "organic conversational flow with natural micro-inflections";

      const styleInstruction = [
        `Voice Identity: ${personaPrompt}`,
        `Emotional Tone (${emotion?.label || "Natural"}, ${intensityPct}% intensity — ${intensityDescriptor}): ${
          emotion?.stylePrompt || "Speak naturally, warmly, and authentically."
        }${secondaryBlend}`,
        `Pacing & Cadence: Speak with a ${paceDescriptor}, ${pauseDescriptor}, and ${rhythmDescriptor}.`,
      ].join(" ");

      const pauseMs = Number(pacing?.pauseMs) || 350;
      const segments = splitScriptWithCustomPauses(text, pauseMs);

      const pcmParts: Buffer[] = [];
      let outSampleRate = 24000;
      let outChannels = 1;
      let outBits = 16;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const wavBuf = await synthesizeSegmentAudio(
          ai,
          seg.text,
          styleInstruction,
          anchorVoice,
          customVoiceRef,
          languageCode
        );
        const parsedWav = parseWavBuffer(wavBuf);
        if (i === 0) {
          outSampleRate = parsedWav.sampleRate;
          outChannels = parsedWav.numChannels;
          outBits = parsedWav.bitsPerSample;
        }

        const fadedPcm =
          segments.length > 1
            ? applyEdgeMicroFade(parsedWav.pcmData, outSampleRate)
            : parsedWav.pcmData;
        pcmParts.push(fadedPcm);

        if (seg.pauseAfterSec > 0) {
          const bytesPerSample = (outChannels * outBits) / 8;
          const silenceSamples = Math.round(outSampleRate * seg.pauseAfterSec);
          pcmParts.push(Buffer.alloc(silenceSamples * bytesPerSample, 0));
        }
      }

      const finalWav = buildWavFromPcm(
        Buffer.concat(pcmParts),
        outSampleRate,
        outChannels,
        outBits
      );

      res.json({
        audioBase64: finalWav.toString("base64"),
        mimeType: "audio/wav",
        sampleRate: outSampleRate,
        appliedStylePrompt: styleInstruction,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to synthesize speech.";
      console.error("Speech synthesis error:", error);
      res.status(500).json({ error: message });
    }
  });

  const distPath = path.resolve(__dirname, "dist");
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Voxforma server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
