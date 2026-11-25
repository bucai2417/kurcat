export type SwitchProfile = 'linear' | 'tactile' | 'clicky' | 'silent';
export interface InputSoundConfig {
  keyboard: boolean;
  mouse: boolean;
  profile: SwitchProfile;
  volume: number;
}
export const DEFAULT_INPUT_SOUND: InputSoundConfig = {
  keyboard: false, mouse: false, profile: 'linear', volume: 0.35,
};
export function normalizeInputSound(value?: Partial<InputSoundConfig> | null): InputSoundConfig {
  return {
    keyboard: value?.keyboard === true,
    mouse: value?.mouse === true,
    profile: ['linear', 'tactile', 'clicky', 'silent'].includes(value?.profile ?? '')
      ? value!.profile! : 'linear',
    volume: typeof value?.volume === 'number' && Number.isFinite(value.volume)
      ? Math.max(0, Math.min(1, value.volume)) : DEFAULT_INPUT_SOUND.volume,
  };
}

/** Short locally synthesized impacts. No samples, downloads, or persistent oscillators. */
export class InputSounds {
  private config = { ...DEFAULT_INPUT_SOUND };
  private privacy = false;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Map<AudioBufferSourceNode, { gain: GainNode; kind: 'keyboard' | 'mouse' }>();
  private last = { keyboard: -Infinity, mouse: -Infinity };

  constructor(private readonly context: () => AudioContext | null) {}

  public configure(value: Partial<InputSoundConfig> | null | undefined): void {
    this.config = normalizeInputSound(value);
    for (const [source, voice] of this.voices) {
      if (!this.config[voice.kind] || this.config.volume === 0) this.stop(source);
    }
  }

  public setPrivacy(active: boolean): void {
    this.privacy = active;
    if (active) for (const source of [...this.voices.keys()]) this.stop(source);
  }

  public keyDown(repeat = false): void {
    if (!repeat) this.play('keyboard');
  }

  public mouseDown(button: string): void {
    if (['left', 'right', 'middle'].includes(button)) this.play('mouse');
  }

  public async preview(kind: 'keyboard' | 'mouse'): Promise<void> {
    if (this.privacy || this.config.volume === 0) return;
    const ctx = this.context();
    if (!ctx) return;
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch { return; }
    this.play(kind, true);
  }

  private stop(source: AudioBufferSourceNode): void {
    const voice = this.voices.get(source);
    if (!voice) return;
    this.voices.delete(source);
    source.onended = null;
    try { source.stop(); } catch { /* Already ended. */ }
    source.disconnect();
    voice.gain.disconnect();
  }

  private play(kind: 'keyboard' | 'mouse', preview = false): void {
    if (this.privacy || (!preview && !this.config[kind]) || this.config.volume === 0) return;
    const ctx = this.context();
    if (!ctx || ctx.state !== 'running') return; // Never replay stale input after audio unlock.
    const now = ctx.currentTime;
    if (now - this.last[kind] < (kind === 'mouse' ? 0.018 : 0.006)) return;
    this.last[kind] = now;
    while (this.voices.size >= 12) this.stop(this.voices.keys().next().value!);
    const source = ctx.createBufferSource();
    source.buffer = this.buffer(ctx, kind === 'mouse' ? 'mouse' : this.config.profile);
    source.playbackRate.value = preview ? 1 : 0.97 + Math.random() * 0.06;
    const gain = ctx.createGain();
    gain.gain.value = this.config.volume * (kind === 'mouse' ? 0.48 : 0.62);
    source.connect(gain);
    gain.connect(ctx.destination);
    this.voices.set(source, { gain, kind });
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  private buffer(ctx: AudioContext, profile: SwitchProfile | 'mouse'): AudioBuffer {
    const cached = this.buffers.get(profile);
    if (cached) return cached;
    const params = {
      linear: [185, 0.025, 0.15, 0],
      tactile: [310, 0.023, 0.28, 0.011],
      clicky: [520, 0.018, 0.50, 0.009],
      silent: [125, 0.014, 0.06, 0],
      mouse: [1250, 0.009, 0.36, 0.006],
    }[profile];
    const [frequency, decay, noiseLevel, clickDelay] = params;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.14), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lowNoise = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      const noise = Math.random() * 2 - 1;
      lowNoise += (noise - lowNoise) * 0.22;
      const attack = Math.min(1, t / 0.0008);
      const body = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / decay) * 0.60;
      const transient = (profile === 'silent' ? lowNoise : noise) * Math.exp(-t / 0.004) * noiseLevel;
      const clickT = t - clickDelay;
      const click = clickDelay > 0 && clickT > 0
        ? Math.sin(2 * Math.PI * 2600 * clickT) * Math.exp(-clickT / 0.003) * noiseLevel : 0;
      data[i] = (body + transient + click) * attack * Math.max(0, 1 - t / 0.14);
    }
    this.buffers.set(profile, buffer);
    return buffer;
  }
}
