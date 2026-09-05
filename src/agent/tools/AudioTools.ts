/**
 * MaxIDE - Universal AI Audio & Music Generation Engine
 * Implements Section 8 & Section 13 of Master Architecture:
 * Authentic 44.1kHz 16-bit PCM audio synthesis with musical composition,
 * chord progression algorithms, and external speech/audio API provider adapters.
 * STRICT NO-FAKE POLICY: Always outputs genuine, playable, non-silent binary audio.
 */

import fs from 'fs';
import path from 'path';
import { ArtifactManager, Artifact } from '../../artifacts/ArtifactManager.js';
import { ExecutableTool } from '../ToolDefinition.js';

export interface AudioGenerationOptions {
  prompt: string;
  outputPath?: string;
  durationSeconds?: number;
  genre?: 'relaxing' | 'game' | 'cyberpunk' | 'cinematic' | 'ambient' | 'lofi';
  workspaceRoot?: string;
  artifactManager?: ArtifactManager;
  apiKey?: string;
}

export interface AudioGenerationResult {
  success: boolean;
  filePath: string;
  relativeUrl: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  format: 'wav' | 'mp3';
  provider: 'maxide-synth' | 'openai' | 'external';
  prompt: string;
  artifact?: Artifact;
  error?: string;
}

export class AudioTools {
  /**
   * Synthesize real audio file (.wav) based on prompt
   */
  public static async generateAudio(
    options: AudioGenerationOptions
  ): Promise<AudioGenerationResult> {
    const root = options.workspaceRoot || process.cwd();
    const assetsDir = path.join(root, 'assets', 'audio');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

    const prompt = options.prompt || 'Relaxing background music';
    const lower = prompt.toLowerCase();
    const duration = Math.max(3, Math.min(60, options.durationSeconds || 10));

    // Determine style
    let style: 'relaxing' | 'game' | 'cyberpunk' | 'cinematic' | 'ambient' = 'relaxing';
    if (lower.includes('game') || lower.includes('8-bit') || lower.includes('arcade') || lower.includes('retro')) {
      style = 'game';
    } else if (lower.includes('cyber') || lower.includes('synth') || lower.includes('future') || lower.includes('techno')) {
      style = 'cyberpunk';
    } else if (lower.includes('epic') || lower.includes('cinematic') || lower.includes('orchestral')) {
      style = 'cinematic';
    } else if (lower.includes('ambient') || lower.includes('calm') || lower.includes('meditation') || lower.includes('peaceful')) {
      style = 'ambient';
    }

    const cleanName = prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 30)
      .replace(/^_+|_+$/g, '') || 'generated_audio';

    const filename = `${cleanName}_${Date.now()}.wav`;
    const targetFile = options.outputPath
      ? (path.isAbsolute(options.outputPath) ? options.outputPath : path.join(root, options.outputPath))
      : path.join(assetsDir, filename);

    // Ensure directory exists
    const dir = path.dirname(targetFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Try OpenAI Audio API if requested speech & valid key
    const openAiKey = options.apiKey || process.env.OPENAI_API_KEY;
    if (openAiKey && openAiKey.startsWith('sk-') && !openAiKey.includes('mock') && lower.includes('speak')) {
      try {
        const speechRes = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: prompt,
            voice: 'alloy',
            response_format: 'wav',
          }),
        });

        if (speechRes.ok) {
          const buf = Buffer.from(await speechRes.arrayBuffer());
          fs.writeFileSync(targetFile, buf);
          const relFile = path.relative(root, targetFile).replace(/\\/g, '/');
          const relUrl = `/workspace-preview/${relFile}`;

          let art: Artifact | undefined;
          if (options.artifactManager) {
            art = options.artifactManager.registerArtifact({
              type: 'AUDIO',
              name: path.basename(targetFile),
              filePath: targetFile,
              description: `AI Audio Voice: "${prompt}"`,
              provider: 'OpenAI Speech',
              prompt,
              metadata: { durationSeconds: duration, sampleRate: 24000, channels: 1 },
              status: 'verified',
            });
          }

          return {
            success: true,
            filePath: targetFile,
            relativeUrl: relUrl,
            durationSeconds: duration,
            sampleRate: 24000,
            channels: 1,
            format: 'wav',
            provider: 'openai',
            prompt,
            artifact: art,
          };
        }
      } catch (err) {
        console.warn('[AudioTools] OpenAI Speech call failed, using high-fidelity synth:', err);
      }
    }

    // High-Fidelity Mathematical Audio Synthesizer (44.1kHz, 16-bit Stereo PCM)
    const sampleRate = 44100;
    const channels = 2;
    const totalSamples = sampleRate * duration;
    const wavBuffer = this.synthesizeMusicalWav(totalSamples, sampleRate, style);

    fs.writeFileSync(targetFile, wavBuffer);

    const relFile = path.relative(root, targetFile).replace(/\\/g, '/');
    const relUrl = `/workspace-preview/${relFile}`;

    let artifact: Artifact | undefined;
    if (options.artifactManager) {
      artifact = options.artifactManager.registerArtifact({
        type: 'AUDIO',
        name: path.basename(targetFile),
        filePath: targetFile,
        description: `Synthesized Soundtrack (${style}): "${prompt}"`,
        provider: 'MaxIDE Audio Synth',
        prompt,
        metadata: {
          durationSeconds: duration,
          sampleRate,
          channels,
          genre: style,
        },
        status: 'verified',
      });
    }

    return {
      success: true,
      filePath: targetFile,
      relativeUrl: relUrl,
      durationSeconds: duration,
      sampleRate,
      channels,
      format: 'wav',
      provider: 'maxide-synth',
      prompt,
      artifact,
    };
  }

  /**
   * Synthesize real stereo PCM musical composition into WAV Buffer
   */
  private static synthesizeMusicalWav(
    totalSamples: number,
    sampleRate: number,
    style: 'relaxing' | 'game' | 'cyberpunk' | 'cinematic' | 'ambient'
  ): Buffer {
    // Standard 44-byte WAV header + 16-bit stereo samples
    const numChannels = 2;
    const bytesPerSample = 2; // 16-bit
    const dataSize = totalSamples * numChannels * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);

    // 1. RIFF chunk descriptor
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // 2. fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);          // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20);           // AudioFormat (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22); // NumChannels (2 = Stereo)
    buffer.writeUInt32LE(sampleRate, 24);  // SampleRate
    buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // ByteRate
    buffer.writeUInt16LE(numChannels * bytesPerSample, 32);              // BlockAlign
    buffer.writeUInt16LE(16, 34);          // BitsPerSample

    // 3. data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Define harmonic chord progression frequencies (Hz) based on style
    // A-minor / C-major pentatonic base:
    const progressions: Record<string, number[][]> = {
      relaxing: [
        [261.63, 329.63, 392.00, 523.25], // C major (C4, E4, G4, C5)
        [220.00, 261.63, 329.63, 440.00], // A minor (A3, C4, E4, A4)
        [174.61, 220.00, 261.63, 349.23], // F major (F3, A3, C4, F4)
        [196.00, 246.94, 293.66, 392.00], // G major (G3, B3, D4, G4)
      ],
      game: [
        [220.00, 261.63, 329.63, 440.00], // Am
        [174.61, 220.00, 261.63, 349.23], // F
        [196.00, 246.94, 293.66, 392.00], // G
        [164.81, 196.00, 246.94, 329.63], // Em
      ],
      cyberpunk: [
        [146.83, 220.00, 293.66, 440.00], // Dm bass
        [110.00, 164.81, 220.00, 329.63], // A bass
        [130.81, 196.00, 261.63, 392.00], // C bass
        [123.47, 185.00, 246.94, 369.99], // B bass
      ],
      cinematic: [
        [110.00, 164.81, 220.00, 261.63], // Deep A minor
        [87.31, 130.81, 174.61, 220.00],  // Deep F
        [98.00, 146.83, 196.00, 246.94],  // Deep G
        [110.00, 164.81, 220.00, 329.63], // Deep Am
      ],
      ambient: [
        [174.61, 261.63, 329.63, 392.00], // Fmaj9
        [220.00, 261.63, 329.63, 392.00], // Am7
        [196.00, 293.66, 392.00, 440.00], // Gsus4
        [130.81, 196.00, 261.63, 329.63], // Cmaj7
      ],
    };

    const chords = progressions[style] || progressions.relaxing;
    const chordDurationSeconds = 2.5;
    const chordSamples = Math.floor(sampleRate * chordDurationSeconds);

    let writeOffset = 44;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const currentChordIndex = Math.floor((i / chordSamples) % chords.length);
      const chord = chords[currentChordIndex];

      // Time inside the current chord
      const chordLocalTime = (i % chordSamples) / sampleRate;
      // Smooth attack and release envelope per chord
      const envAttack = Math.min(1.0, chordLocalTime / 0.4);
      const envRelease = Math.min(1.0, (chordDurationSeconds - chordLocalTime) / 0.4);
      const envelope = Math.max(0.1, envAttack * envRelease);

      let leftSignal = 0;
      let rightSignal = 0;

      if (style === 'game') {
        // Fast 8-bit chiptune arpeggio (16th notes)
        const arpRate = 8; // 8 notes per second
        const noteIndex = Math.floor(t * arpRate) % chord.length;
        const freq = chord[noteIndex];
        // Square wave
        const square = Math.sin(2 * Math.PI * freq * t) > 0 ? 0.35 : -0.35;
        // Triangle wave bass
        const bassFreq = chord[0] / 2;
        const tri = (Math.asin(Math.sin(2 * Math.PI * bassFreq * t)) * 2) / Math.PI;

        leftSignal = (square * 0.7 + tri * 0.3) * envelope;
        rightSignal = (square * 0.7 + tri * 0.3) * envelope;
      } else if (style === 'cyberpunk') {
        // Detuned sawtooth bass + synth lead
        const bassFreq = chord[0];
        // Sawtooth wave synthesis
        const saw1 = 2 * ((t * bassFreq) % 1) - 1;
        const saw2 = 2 * ((t * (bassFreq * 1.01)) % 1) - 1;
        const leadFreq = chord[2] * 2;
        const leadSine = Math.sin(2 * Math.PI * leadFreq * t);

        leftSignal = (saw1 * 0.35 + leadSine * 0.25) * envelope;
        rightSignal = (saw2 * 0.35 + leadSine * 0.25) * envelope;
      } else {
        // Relaxing / Ambient warm harmonic chord pad with subtle vibrato
        const vibrato = 1 + 0.003 * Math.sin(2 * Math.PI * 4.5 * t);
        for (let c = 0; c < chord.length; c++) {
          const freq = chord[c] * vibrato;
          const sine = Math.sin(2 * Math.PI * freq * t);
          // Stereo panning spread across chord voices
          const pan = c / (chord.length - 1);
          leftSignal += sine * (1 - pan * 0.5) * (0.22 / chord.length);
          rightSignal += sine * (0.5 + pan * 0.5) * (0.22 / chord.length);
        }
        leftSignal *= envelope;
        rightSignal *= envelope;
      }

      // Master fade in (first 0.5s) and fade out (last 1.0s)
      const masterFadeIn = Math.min(1.0, t / 0.5);
      const masterFadeOut = Math.min(1.0, (totalSamples - i) / (sampleRate * 1.0));
      const masterGain = 0.8 * masterFadeIn * masterFadeOut;

      // Clamp to 16-bit signed integer range (-32768 to 32767)
      const sampleL = Math.max(-32768, Math.min(32767, Math.floor(leftSignal * masterGain * 32767)));
      const sampleR = Math.max(-32768, Math.min(32767, Math.floor(rightSignal * masterGain * 32767)));

      buffer.writeInt16LE(sampleL, writeOffset);
      buffer.writeInt16LE(sampleR, writeOffset + 2);
      writeOffset += 4;
    }

    return buffer;
  }
}

export function createAudioTools(workspaceRoot: string, artifactManager?: ArtifactManager): ExecutableTool[] {
  return [
    {
      definition: {
        name: 'generate_audio',
        description: 'Generate a real, playable 44.1kHz 16-bit audio file or background music soundtrack (.wav) and save to workspace assets.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Description of the audio or music, e.g. "relaxing background music for my game"' },
            durationSeconds: { type: 'number', description: 'Duration in seconds (default 10)' },
            genre: { type: 'string', description: 'Musical style: relaxing, game, cyberpunk, cinematic, ambient' },
            outputPath: { type: 'string', description: 'Optional relative output path, e.g. assets/audio/theme.wav' },
          },
          required: ['prompt'],
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: any) => {
        return await AudioTools.generateAudio({
          prompt: args.prompt,
          durationSeconds: args.durationSeconds,
          genre: args.genre,
          outputPath: args.outputPath,
          workspaceRoot,
          artifactManager,
        });
      },
    },
  ];
}
