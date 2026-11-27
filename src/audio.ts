import type { FrogSound } from './naiwaPose';

export class CatAudio {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private graphReady = false;
  private masterGain: GainNode | null = null;
  private currentIntensity = 0;
  private outputConnected = false;
  private voices = new Set<{ source: OscillatorNode; gain: GainNode }>();
  private lastVoiceAt = new Map<FrogSound, number>();

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopPetVoices();
      this.currentIntensity = 0;
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.masterGain.disconnect();
      }
    } else if (this.masterGain && this.ctx && !this.outputConnected) {
      this.masterGain.connect(this.ctx.destination);
    }
    this.outputConnected = enabled && this.graphReady;
  }

  public getContext(): AudioContext | null {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch { return null; }
    }
    return this.ctx;
  }

  public unlock(): void {
    const ctx = this.getContext();
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
  }

  /** Original short synthesized frog sounds; never queue audio while the browser is locked. */
  public playFrogSound(kind: FrogSound): boolean {
    if (!this.enabled) return false;
    const ctx = this.getContext();
    if (!ctx || ctx.state !== 'running' || this.voices.size >= 3) return false;
    const now = ctx.currentTime;
    const cooldown = kind === 'happy' ? 2.8 : kind === 'surprise' ? 1.2 : 0.18;
    if (now - (this.lastVoiceAt.get(kind) ?? -100) < cooldown) return false;
    const spec = { croak: [300, 110, 0.24, 0.065], happy: [240, 410, 0.20, 0.045],
      surprise: [470, 165, 0.18, 0.05], stomp: [110, 45, 0.12, 0.085] }[kind];
    const [startHz, endHz, duration, volume] = spec;
    const source = ctx.createOscillator(), gain = ctx.createGain();
    source.type = kind === 'stomp' ? 'sine' : 'triangle';
    source.frequency.setValueAtTime(startHz, now);
    source.frequency.exponentialRampToValueAtTime(endHz, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(gain); gain.connect(ctx.destination);
    const voice = { source, gain };
    source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(voice); };
    this.voices.add(voice); this.lastVoiceAt.set(kind, now);
    source.start(now); source.stop(now + duration + 0.02);
    return true;
  }

  /** Model switches, privacy and mute must also silence already-started one-shots. */
  public stopPetVoices(): void {
    for (const { source, gain } of this.voices) {
      source.onended = null;
      try { source.stop(); } catch { /* already ended */ }
      source.disconnect(); gain.disconnect();
    }
    this.voices.clear(); this.lastVoiceAt.clear();
  }

  private ensurePurrGraph(): boolean {
    if (!this.enabled || !this.getContext() || !this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    if (this.graphReady) return true;

    const ctx = this.ctx;
    const sampleRate = ctx.sampleRate;
    const bufLen = Math.floor(sampleRate * 3.0);
    const noiseBuf = ctx.createBuffer(1, bufLen, sampleRate);
    const data = noiseBuf.getChannelData(0);
    // Smooth warm noise buffer for organic feline throat & breath texture
    for (let i = 0; i < bufLen; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    // Layer 1: Warm chest rumble (~190 Hz)
    const warmFilter = ctx.createBiquadFilter();
    warmFilter.type = 'bandpass';
    warmFilter.frequency.value = 190;
    warmFilter.Q.value = 1.15;
    const warmGain = ctx.createGain();
    warmGain.gain.value = 1.45;

    // Layer 2: Soft breathy throat resonance (~520 Hz)
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.value = 520;
    breathFilter.Q.value = 1.4;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.34;

    // 24.5 Hz feline purr flutter amplitude modulation (0.30 .. 1.00)
    const flutterGain = ctx.createGain();
    flutterGain.gain.value = 0.65;
    const flutterLfo = ctx.createOscillator();
    flutterLfo.type = 'sine';
    flutterLfo.frequency.value = 24.5;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.35;
    flutterLfo.connect(flutterDepth);
    flutterDepth.connect(flutterGain.gain);

    // Slow cozy breathing cadence (~0.68 Hz: inhale/exhale swell)
    const breathCycleGain = ctx.createGain();
    breathCycleGain.gain.value = 0.76;
    const breathLfo = ctx.createOscillator();
    breathLfo.type = 'sine';
    breathLfo.frequency.value = 0.68;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.24;
    breathLfo.connect(breathDepth);
    breathDepth.connect(breathCycleGain.gain);

    // Soft lowpass polish so it sounds cozy on both speakers & headphones
    const polishFilter = ctx.createBiquadFilter();
    polishFilter.type = 'lowpass';
    polishFilter.frequency.value = 1400;

    // Master output gain (starts silent, ramps smoothly during petting)
    const master = ctx.createGain();
    master.gain.value = 0;

    noiseSrc.connect(warmFilter);
    warmFilter.connect(warmGain);
    warmGain.connect(flutterGain);

    noiseSrc.connect(breathFilter);
    breathFilter.connect(breathGain);
    breathGain.connect(flutterGain);

    flutterGain.connect(breathCycleGain);
    breathCycleGain.connect(polishFilter);
    polishFilter.connect(master);
    master.connect(ctx.destination);

    noiseSrc.start();
    flutterLfo.start();
    breathLfo.start();

    this.masterGain = master;
    this.graphReady = true;
    this.outputConnected = true;
    return true;
  }

  /**
   * Smoothly drives real-time organic cat purring (0 = silent, 1 = full cozy purr).
   */
  public setPurrIntensity(intensity: number): void {
    const target = this.enabled ? Math.max(0, Math.min(1, intensity)) : 0;
    if (target <= 0.01 && !this.graphReady) return;
    if (Math.abs(target - this.currentIntensity) < 0.005) return;
    if (target > 0.01 && !this.ensurePurrGraph()) return;
    this.currentIntensity = target;
    if (!this.ctx || !this.masterGain) return;

    if (target > 0.01 && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;
    const targetGain = target * 0.26;
    const timeConst = target > 0.01 ? 0.14 : 0.22;
    this.masterGain.gain.setTargetAtTime(targetGain, now, timeConst);
  }
}

export const catAudio = new CatAudio();
