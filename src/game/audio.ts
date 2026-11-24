/* Procedural audio for DRIFT — no assets, all WebAudio synthesis. */

const PENTA = [
  261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0,
];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private volume = 0.8;
  private ambientOn = false;
  private rumbleGain: GainNode | null = null;
  private rainGain: GainNode | null = null;

  constructor(muted: boolean, volume = 0.8) {
    this.muted = muted;
    this.volume = volume;
  }

  /** Must be called from a user gesture. */
  ensure(): AudioContext | null {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.04);
    }
  }

  /** Android backgrounding: stop the audio thread to save battery. */
  suspend() {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master && !this.muted) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.04);
    }
  }

  private tone(
    freq: number,
    opts: {
      type?: OscillatorType;
      peak?: number;
      attack?: number;
      decay?: number;
      delay?: number;
      glideTo?: number;
    } = {},
  ) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    const {
      type = "sine",
      peak = 0.14,
      attack = 0.006,
      decay = 0.7,
      delay = 0,
      glideTo,
    } = opts;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + decay * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.05);
  }

  private noise(opts: {
    dur?: number;
    peak?: number;
    freq?: number;
    q?: number;
    type?: BiquadFilterType;
    delay?: number;
    glideTo?: number;
  } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    const {
      dur = 0.3,
      peak = 0.2,
      freq = 300,
      q = 0.8,
      type = "lowpass",
      delay = 0,
      glideTo,
    } = opts;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t0);
    if (glideTo) filt.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur * 0.9);
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
  }

  /** Wisp catch — pentatonic chime rising with combo. */
  chime(step: number, teal = false) {
    const i = Math.min(Math.max(step, 0), PENTA.length - 1);
    const f = PENTA[i];
    this.tone(f, { peak: 0.16, decay: 0.85 });
    this.tone(f * 2.003, { peak: 0.055, decay: 0.6 });
    this.tone(f * 3.01, { peak: 0.02, decay: 0.4 });
    if (teal) this.tone(f * 1.5, { peak: 0.07, decay: 0.7, delay: 0.03 });
  }

  /** Star-jelly bloom. */
  jelly() {
    this.tone(300, { peak: 0.12, decay: 0.6, glideTo: 1050 });
    this.chime(4);
    this.chime(6, true);
    this.chime(9);
  }

  /** Rock graze. */
  thud() {
    this.tone(105, { peak: 0.24, decay: 0.32, glideTo: 42 });
    this.noise({ dur: 0.35, peak: 0.22, freq: 420, glideTo: 120 });
  }

  click() {
    this.tone(620, { type: "triangle", peak: 0.06, decay: 0.09 });
  }

  startSwell() {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    [130.8, 196.0, 261.6, 329.6].forEach((f, i) =>
      this.tone(f, { peak: 0.05, attack: 0.9 + i * 0.15, decay: 2.4 }),
    );
  }

  gameOver() {
    [392.0, 329.6, 261.6, 196.0].forEach((f, i) =>
      this.tone(f, { peak: 0.09, decay: 1.1, delay: i * 0.22 }),
    );
    this.noise({ dur: 1.6, peak: 0.05, freq: 600, glideTo: 140, type: "bandpass" });
  }

  /** Driftwood impact. */
  crack() {
    this.noise({ dur: 0.14, peak: 0.3, freq: 1500, q: 2.2, type: "bandpass" });
    this.tone(230, { type: "triangle", peak: 0.2, decay: 0.2, glideTo: 80 });
    this.noise({ dur: 0.3, peak: 0.16, freq: 380, glideTo: 120 });
  }

  /** Lightning strike. */
  zap() {
    this.noise({ dur: 0.28, peak: 0.34, freq: 3200, q: 0.6, type: "highpass" });
    this.tone(1900, { type: "sawtooth", peak: 0.09, decay: 0.2, glideTo: 160 });
  }

  /** Charge building on the water before a strike. */
  sizzle() {
    this.noise({ dur: 0.9, peak: 0.05, freq: 5200, q: 3, type: "bandpass", glideTo: 7600 });
    this.tone(620, { type: "triangle", peak: 0.035, decay: 0.8, glideTo: 1500 });
  }

  thunder(delay = 0, vol = 1) {
    this.noise({ dur: 2.6, peak: 0.38 * vol, freq: 210, glideTo: 46, delay });
    this.tone(58, { peak: 0.24 * vol, decay: 1.5, glideTo: 34, delay });
  }

  closeCall() {
    this.tone(987.8, { peak: 0.07, decay: 0.16 });
    this.tone(1318.5, { peak: 0.06, decay: 0.3, delay: 0.07 });
  }

  /** Sea mine detonation — deep water boom + splash spray. */
  mineBoom() {
    this.tone(86, { peak: 0.3, decay: 0.55, glideTo: 30 });
    this.noise({ dur: 0.55, peak: 0.32, freq: 580, glideTo: 110 });
    this.noise({ dur: 0.7, peak: 0.16, freq: 1800, type: "bandpass", glideTo: 420, delay: 0.06 });
  }

  /** Rogue breaker wave slam. */
  waveRoar() {
    this.noise({ dur: 0.7, peak: 0.3, freq: 650, glideTo: 180 });
    this.tone(72, { peak: 0.18, decay: 0.42, glideTo: 38 });
  }

  /** Low two-note horn for hazard alerts. */
  warn() {
    this.tone(196, { type: "triangle", peak: 0.11, attack: 0.03, decay: 0.38 });
    this.tone(174.6, { type: "triangle", peak: 0.11, attack: 0.03, decay: 0.6, delay: 0.3 });
  }

  /** Deep, resonant coastal foghorn — sounds on lighthouse checkpoints. */
  foghorn() {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    this.tone(116.54, { type: "sawtooth", peak: 0.18, attack: 0.14, decay: 2.1, glideTo: 110.0 });
    this.tone(146.83, { type: "triangle", peak: 0.15, attack: 0.16, decay: 2.0, glideTo: 138.6 });
    this.tone(73.42, { type: "sine", peak: 0.24, attack: 0.20, decay: 2.4, glideTo: 69.3 });
    this.noise({ dur: 2.0, peak: 0.08, freq: 360, type: "lowpass", delay: 0.05 });
  }

  /** Haunting bell buoy chime echoing across foggy waters. */
  bellBuoy() {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    this.tone(587.33, { type: "sine", peak: 0.13, attack: 0.005, decay: 1.8 });
    this.tone(1174.66, { type: "triangle", peak: 0.07, attack: 0.003, decay: 1.1, delay: 0.005 });
    this.tone(1760.0, { type: "sine", peak: 0.035, attack: 0.002, decay: 0.6, delay: 0.008 });
  }

  /** Atmospheric chime cue when crossing into a new biome. */
  biomeCue() {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    [261.63, 392.0, 523.25, 659.25].forEach((f, i) => {
      this.tone(f, { type: "sine", peak: 0.08, attack: 0.25 + i * 0.1, decay: 1.9, delay: i * 0.14 });
    });
  }

  /** Whirlpool proximity rumble, 0..1. */
  setRumble(v: number) {
    if (this.ctx && this.rumbleGain)
      this.rumbleGain.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.15);
  }

  /** Rain intensity, 0..1. */
  setRain(v: number) {
    if (this.ctx && this.rainGain)
      this.rainGain.gain.setTargetAtTime(v * 0.085, this.ctx.currentTime, 0.3);
  }

  /** Gentle infinite ambience: warm pad + filtered wave noise. */
  startAmbient() {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.ambientOn) return;
    this.ambientOn = true;

    // Pad
    const padGain = ctx.createGain();
    padGain.gain.value = 0.035;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 340;
    padGain.connect(lp).connect(this.master);
    [65.4, 98.0, 130.8].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? "triangle" : "sine";
      o.frequency.value = f;
      o.detune.value = i * 4 - 4;
      o.connect(padGain);
      o.start();
    });
    const padLfo = ctx.createOscillator();
    padLfo.frequency.value = 0.06;
    const padLfoAmt = ctx.createGain();
    padLfoAmt.gain.value = 0.016;
    padLfo.connect(padLfoAmt).connect(padGain.gain);
    padLfo.start();

    // Waves — looped noise through a wandering bandpass
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 320;
    bp.Q.value = 0.5;
    const waveGain = ctx.createGain();
    waveGain.gain.value = 0.045;
    src.connect(bp).connect(waveGain).connect(this.master);
    src.start();
    const lfo1 = ctx.createOscillator();
    lfo1.frequency.value = 0.085;
    const amt1 = ctx.createGain();
    amt1.gain.value = 0.028;
    lfo1.connect(amt1).connect(waveGain.gain);
    lfo1.start();
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.037;
    const amt2 = ctx.createGain();
    amt2.gain.value = 170;
    lfo2.connect(amt2).connect(bp.frequency);
    lfo2.start();

    // Whirlpool rumble + rain: silent layers the engine fades in
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = "lowpass";
    rumbleLp.frequency.value = 110;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    src.connect(rumbleLp).connect(this.rumbleGain).connect(this.master);
    const rainHp = ctx.createBiquadFilter();
    rainHp.type = "highpass";
    rainHp.frequency.value = 2400;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    src.connect(rainHp).connect(this.rainGain).connect(this.master);
  }
}
