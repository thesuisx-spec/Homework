// audio.js — the score, synthesized from the film's plan. No samples, no network.
// Japanese palette: shamisen (sawari), koto, shakuhachi, taiko, shime-daiko, hyoshigi, temple bell, wind chime.
// Mode: miyako-bushi on E. Foley follows the material: paper, water, rain, birds.
(function () {
  const SR = 48000;
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const hz = (n) => 440 * Math.pow(2, (NOTE[n[0]] + 12 * (+n.slice(1) + 1) - 69) / 12);

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  let R = rng(7);
  const noise = (n) => { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = R() * 2 - 1; return x; };

  // RBJ biquads; two in series ≈ the Butterworth slopes the original score used
  function biquad(x, type, f, q) {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * (q || 0.7071));
    let b0, b1, b2, a0, a1, a2;
    if (type === "lp") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  const lp = (x, f) => biquad(x, "lp", f);
  const hp = (x, f) => biquad(x, "hp", f);
  const bp = (x, lo, hi) => lp(hp(x, lo), hi);
  const mul = (x, fn) => { for (let i = 0; i < x.length; i++) x[i] *= fn(i / SR, i); return x; };
  const add = (x, y, g) => { for (let i = 0; i < x.length; i++) x[i] += y[i] * (g == null ? 1 : g); return x; };
  const norm = (x) => { let m = 1e-9; for (const v of x) m = Math.max(m, Math.abs(v)); for (let i = 0; i < x.length; i++) x[i] /= m; return x; };

  // ---------------- instruments ----------------
  function pluck(f, dur, damp, bright, seed) {
    const n = Math.floor(dur * SR), L = Math.max(2, Math.round(SR / f)), r = rng(seed);
    let buf = new Float32Array(L); for (let i = 0; i < L; i++) buf[i] = r() * 2 - 1;
    buf = lp(buf, 2000 + 9000 * bright);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i < L) out[i] = buf[i];
      else out[i] = damp * 0.5 * (out[i - L] + out[i - L - 1 >= 0 ? i - L - 1 : 0]);
    }
    for (let i = 0; i < Math.min(n, 96); i++) out[i] *= 1 - Math.exp(-i / 96);
    return norm(out);
  }
  const koto = (f, dur, seed) => mul(pluck(f, dur || 2.4, 0.9965, 0.75, seed), (t) => Math.exp(-t / ((dur || 2.4) * 0.45)));
  function shamisen(f, dur, seed, sawari) {
    const y = pluck(f, dur, 0.993, 0.9, seed), e = lp(y.map(Math.abs), 30), nz = bp(noise(y.length), 2200, 6000);
    const s = sawari == null ? 0.35 : sawari;
    for (let i = 0; i < y.length; i++) y[i] = (y[i] + nz[i] * e[i] * s * 3 + 0.15 * Math.tanh(3 * y[i])) * Math.exp(-i / (dur * 0.4 * SR));
    return y;
  }
  function shakuhachi(f, dur, meri) {
    const n = Math.floor(dur * SR), y = new Float32Array(n), br = bp(noise(n), f * 1.2, Math.min(f * 6, 16000)), ch = bp(noise(n), 1500, 5000);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let p = f * Math.pow(2, (-1 + Math.min(1, t / 0.18)) / 12);
      p *= 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, Math.max(0, (t - 0.5) / 0.4));
      if (meri) p *= Math.pow(2, -Math.min(1, Math.max(0, (t - (dur - 0.45)) / 0.35)) / 12);
      ph += (2 * Math.PI * p) / SR;
      const tone = Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.07 * Math.sin(3 * ph);
      const a = Math.min(1, t / 0.22) * Math.min(1, Math.max(0, (dur - t) / 0.4));
      y[i] = (tone * (0.75 + 0.25 * Math.min(1, t / 0.6)) + br[i] * 0.5 * (0.6 - 0.3 * Math.min(1, t / 0.8)) + Math.exp(-t / 0.06) * ch[i] * 0.6) * a;
    }
    return y;
  }
  function taiko(gain, low) {
    const n = Math.floor(1.2 * SR), y = new Float32Array(n), sk = lp(noise(n), 900), L = low || 55;
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * (L + (110 - L) * Math.exp(-t / 0.05))) / SR; y[i] = (Math.sin(ph) * Math.exp(-t / 0.42) + sk[i] * Math.exp(-t / 0.03) * 0.6) * (gain || 1); }
    return y;
  }
  function shime() {
    const n = Math.floor(0.4 * SR), y = new Float32Array(n), nz = bp(noise(n), 1500, 6000);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * (260 + 90 * Math.exp(-t / 0.02))) / SR; y[i] = Math.sin(ph) * Math.exp(-t / 0.08) + nz[i] * Math.exp(-t / 0.015) * 0.5; }
    return y;
  }
  function hyoshigi(gain) {
    const n = Math.floor(0.25 * SR), y = new Float32Array(n), nz = hp(noise(n), 3000);
    for (let i = 0; i < n; i++) { const t = i / SR; y[i] = ((Math.sin(2 * Math.PI * 1870 * t) * 0.8 + Math.sin(2 * Math.PI * 2710 * t) * 0.5 + Math.sin(2 * Math.PI * 980 * t) * 0.4) * Math.exp(-t / 0.022) + nz[i] * Math.exp(-t / 0.004) * 0.9) * (gain || 1); }
    return y;
  }
  function bell(f, dur) {
    const n = Math.floor(dur * SR), y = new Float32Array(n), th = lp(noise(n), 400);
    const parts = [[0.5, 0.5, 6], [1, 1, 4.5], [1.19, 0.5, 3], [1.56, 0.45, 2.6], [2, 0.4, 2.2], [2.74, 0.3, 1.5], [3, 0.25, 1.2], [4.1, 0.15, 0.8]];
    for (let i = 0; i < n; i++) {
      const t = i / SR; let v = 0;
      for (const [r, a, tau] of parts) v += a * 0.5 * (Math.sin(2 * Math.PI * f * r * t) + Math.sin(2 * Math.PI * (f * r + 0.35) * t)) * Math.exp(-t / tau);
      y[i] = v + th[i] * Math.exp(-t / 0.05) * 0.8;
    }
    return y;
  }
  function furin() {
    const n = Math.floor(1.6 * SR), y = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; y[i] = (Math.sin(2 * Math.PI * 3150 * t) * Math.exp(-t / 0.9) + 0.4 * Math.sin(2 * Math.PI * 5620 * t) * Math.exp(-t / 0.5) + 0.2 * Math.sin(2 * Math.PI * 8300 * t) * Math.exp(-t / 0.25)) * (1 - Math.exp(-t / 0.001)); }
    return y;
  }
  function sealThump() {
    const n = Math.floor(0.35 * SR), y = new Float32Array(n), nz = lp(noise(n), 500), pe = hp(noise(n), 2500), k = Math.floor(0.09 * SR);
    for (let i = 0; i < n; i++) { const t = i / SR; y[i] = Math.sin(2 * Math.PI * 85 * t) * Math.exp(-t / 0.06) + nz[i] * Math.exp(-t / 0.02) * 0.8 + (i >= k ? pe[i] * Math.exp(-(i - k) / (0.03 * SR)) * 0.15 : 0); }
    return y;
  }
  function baren(dur) {
    const d = dur || 0.42, n = Math.floor(d * SR), x = bp(noise(n), 300, 1600);
    return mul(x, (t) => (0.55 + 0.45 * Math.pow(Math.sin(2 * Math.PI * 7 * t), 2)) * Math.pow(Math.sin(Math.PI * Math.min(1, t / d)), 0.7));
  }
  const whoosh = (d) => mul(bp(noise(Math.floor(d * SR)), 200, 2400), (t) => Math.pow(Math.sin((Math.PI * t) / d), 2));
  function chirp(f0, f1, d) {
    const n = Math.floor(d * SR), y = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { ph += (2 * Math.PI * (f0 + ((f1 - f0) * i) / n)) / SR; y[i] = Math.sin(ph) * Math.sin((Math.PI * i) / n); }
    return y;
  }
  function boom() {
    const n = Math.floor(1.5 * SR), y = lp(noise(n), 220);
    for (let i = 0; i < n; i++) { const t = i / SR; y[i] = y[i] * Math.exp(-t / 0.35) * 1.2 + Math.sin(2 * Math.PI * 46 * t) * Math.exp(-t / 0.3); }
    return y;
  }
  function crackle() {
    const n = Math.floor(1.8 * SR), y = new Float32Array(n);
    for (let k = 0; k < 70; k++) y[Math.floor(0.35 * SR + R() * (n - 0.35 * SR - 1))] = R() * 2 - 1;
    return mul(hp(y, 2500), (t, i) => 4 * (1 - (0.8 * i) / n));
  }
  // beds
  function bed(kind, dur, fade) {
    const n = Math.floor(dur * SR); let x;
    if (kind === "water") { x = lp(noise(n), 700); const m = lp(lp(noise(n), 2), 0.6); norm(m); for (let i = 0; i < n; i++) x[i] *= 0.5 + 0.5 * m[i]; }
    else if (kind === "rain") { x = bp(noise(n), 900, 9000); for (let i = 0; i < n; i++) x[i] *= 0.6; const d = new Float32Array(n); for (let k = 0; k < n / 300; k++) d[Math.floor(R() * n)] = R() * 2 - 1; add(x, bp(d, 1500, 7000), 3); }
    else { x = bp(noise(n), 150, 700); for (let i = 0; i < n; i++) x[i] *= 0.6 + 0.4 * Math.sin((2 * Math.PI * 0.17 * i) / SR); }
    const k = Math.floor((fade || 0.8) * SR);
    for (let i = 0; i < Math.min(k, n); i++) { x[i] *= i / k; x[n - 1 - i] *= i / k; }
    return x;
  }

  // ---------------- the cue sheet, from the plan ----------------
  function compose(plan, spec) {
    R = rng(7);
    const N = Math.ceil(plan.total * SR) + SR;
    const bus = { music: [new Float32Array(N), new Float32Array(N)], sfx: [new Float32Array(N), new Float32Array(N)], amb: [new Float32Array(N), new Float32Array(N)] };
    function place(b, x, t, pan, gain) {
      const i0 = Math.floor(t * SR); if (i0 >= N || t < 0) return;
      const p = pan || 0, g = gain == null ? 1 : gain, l = Math.cos(((p + 1) * Math.PI) / 4) * 1.414 * g, r = Math.sin(((p + 1) * Math.PI) / 4) * 1.414 * g;
      const L = bus[b][0], Rr = bus[b][1], n = Math.min(x.length, N - i0);
      for (let i = 0; i < n; i++) { L[i0 + i] += x[i] * l; Rr[i0 + i] += x[i] * r; }
    }
    const H = plan.holds;
    if (!H.length) return { bus, N };

    // opening: clappers accelerate into the first block
    [0.3, 0.95, 1.42, 1.75, 1.97, 2.11, 2.2].forEach((t) => place("sfx", hyoshigi(0.6), t, 0.1));
    place("sfx", hyoshigi(1), 2.29, 0.1);
    H.forEach((h, i) => {
      if (h.prints) h.prints.forEach(([, t]) => place("sfx", baren(), t, -0.2, 0.35));
      place("sfx", sealThump(), h.cart + 0.35, 0, 0.7);
      if (i > 0) {
        const a = H[i - 1], t0 = a.end;
        place("sfx", whoosh(2.2), t0, 0, 0.22);
        // the flourish that carries us into the next print
        const v = h.scene.view, nightReprint = h.reprint && h.scene.variant === "night";
        if (nightReprint) [0.2, 0.52, 1.2, 1.5, 2.1, 2.35].forEach((d) => place("music", taiko(0.8, 50), t0 + d, 0, 0.38));
        else if (v === "rain") { for (let k = 0; k < 16; k++) place("music", shime(), t0 + 0.15 + 1.55 * (1 - Math.pow(1 - k / 15, 1.6)), 0.15, 0.12 + (0.2 * k) / 15); place("music", taiko(1), t0 + 2.18, 0, 0.55); }
        else if (v === "asakusa") place("music", shakuhachi(hz("B4"), 2.5, true), t0 + 0.2, -0.1, 0.28);
        else ["E4", "F4", "A4", "B4", "C5", "E5", "F5", "A5", "B5"].forEach((f, k) => place("music", koto(hz(f), 2.2, 40 + k + i * 10), t0 + 0.55 + k * 0.075, -0.3 + k * 0.07, 0.28));
      }
      const s = h.live, e = h.end, len = e - s, v = h.scene.view, night = h.scene.variant === "night";
      if (v === "bay") {
        place("amb", bed("water", e - s + 1.2, 0.6), s - 0.2, 0, 0.2);
        if (!night) {
          [0.7, 0.85, 2.0, 2.15, 2.3, 3.7, 3.82].filter((d) => d < len).forEach((d, k) => place("amb", chirp(3600 + 300 * (k % 3), 4800, 0.07), s + d, 0.5, 0.08));
          const phrase = h.scene.variant === "day" ? [["E5", 1.2, 0.3, false], ["C5", 1.0, 1.7, false], ["B4", 1.6, 2.9, true]] : [["A4", 1.7, 0.3, false], ["B4", 0.9, 2.1, false], ["C5", 1.6, 3.1, true], ["B4", 1.0, 4.9, true]];
          phrase.filter((p) => p[2] + p[1] < len + 0.3).forEach(([f, d, at, m]) => place("music", shakuhachi(hz(f), d, m), s + at, -0.15, 0.32));
          for (let d = 0.25; d < len; d += 1.8) place("music", koto(hz(["E3", "B3", "E3"][Math.floor(d / 1.8) % 3]), 3, Math.floor((s + d) * 10)), s + d, 0.25, 0.35);
        } else {
          [0.9, 1.8, 2.6].filter((d) => d < len).forEach((d) => place("music", taiko(0.5, 48), s + d, 0, 0.22));
          place("music", shamisen(hz("E3"), 3.2, 301, 0.6), s + 0.4, -0.2, 0.3);
          [[2.2, 1], [3.7, 0.6]].filter(([d]) => d < len - 0.3).forEach(([d, g]) => { place("sfx", boom(), s + d - 0.05, 0, 0.42 * g); place("sfx", crackle(), s + d, 0.2, 0.12 * g); });
          if (len > 4) place("music", shamisen(hz("B2"), 3, 302, 0.6), s + 2.5, 0.2, 0.26);
          if (len > 3.5) [["E5", 0.9, -3.2, false], ["C5", 0.7, -2.25, false], ["B4", 1.0, -1.5, true]].forEach(([f, d, at, m]) => place("music", shakuhachi(hz(f), d, m), e + at, -0.15, 0.28));
        }
      } else if (v === "sakura") {
        place("amb", bed("water", len + 1, 0.8), s - 0.4, 0, 0.14);
        place("amb", bed("wind", len + 1, 0.8), s - 0.4, 0, 0.06);
        const mel = [["E5", 0], ["C5", 0.5], ["B4", 0.75], ["A4", 1.5], ["B4", 2.25], ["C5", 2.5], ["E5", 3], ["F5", 3.75], ["E5", 4], ["C5", 4.75], ["B4", 5], ["A4", 5.5]];
        for (let rep = 0; rep * 6.5 < len; rep++) mel.forEach(([f, d], k) => { const t = s + 0.6 + rep * 6.5 + d; if (t < e - 0.3) place("music", koto(hz(f), 2, 60 + k + rep * 20), t, 0.2, night ? 0.24 : 0.3); });
        for (let d = 0.2; d < len; d += 2) place("music", koto(hz("E3"), 2.6, Math.floor((s + d) * 7)), s + d, -0.2, 0.3);
        if (len > 5) place("music", shakuhachi(hz("E4"), 2.6, true), s + len * 0.55, -0.3, 0.2);
      } else if (v === "rain") {
        place("amb", bed("rain", len + 2.2, 1.2), s - 1, 0, night ? 0.15 : 0.18);
        const pat = ["E3", "E3", "B3", "E3", "F3", "E3", "A3", "E3"];
        for (let t = s + 0.05, k = 0; t < e - 0.5; t += 0.25, k++) place("music", shamisen(hz(pat[k % 8]), 0.9, 100 + k), t, k % 2 ? 0.3 : -0.05, k % 4 === 0 ? 0.26 : 0.18);
        for (let d = 2; d < len - 0.5; d += 2) place("music", taiko(0.7), s + d, 0, 0.4);
        if (len > 3) { const n = Math.floor(3 * SR), th = lp(noise(n), 140); mul(th, (t) => Math.pow(Math.sin((Math.PI * t) / 3), 2)); place("amb", th, s + 2.8, 0, 0.35); }
      } else if (v === "asakusa") {
        place("music", bell(night ? 92 : 98, 9), s + 0.6, 0, 0.32);
        [2.0, 3.4, 4.6].filter((d) => d < len).forEach((d) => place("amb", furin(), s + d, 0.55, 0.07));
        [["A3", 1.6], ["E4", 3.0], ["B3", 4.3]].filter(([, d]) => d < len).forEach(([f, d]) => place("music", koto(hz(f), 2.6, Math.floor((s + d) * 9)), s + d, 0.2, 0.26));
        place("amb", bed("wind", len, 0.8), s, 0, 0.05);
      }
    });
    // the wash, then the curtain
    place("sfx", baren(1.3), plan.washAt + 0.05, 0, 0.25);
    place("sfx", hyoshigi(0.9), plan.endAt + 0.05, 0.1);
    place("sfx", hyoshigi(1), plan.endAt + 0.25, 0.1);
    place("sfx", sealThump(), plan.endAt + 0.6, 0, 0.8);
    place("music", bell(110, 6), plan.endAt + 0.9, 0, 0.2);
    return { bus, N };
  }

  function impulse(ctx, rt, seed) {
    const r = rng(seed), n = Math.floor(rt * SR), buf = ctx.createBuffer(2, n, SR);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = Math.floor(0.012 * SR); i < n; i++) d[i] = (r() * 2 - 1) * Math.exp(-i / (SR * (rt / 6.9)));
    }
    return buf;
  }

  // renders the whole soundtrack; returns an AudioBuffer (stereo, 48 kHz)
  async function render(plan, spec) {
    const { bus, N } = compose(plan, spec);
    const ctx = new OfflineAudioContext(2, N, SR);
    function chain(chans, rt, mix, seed, gainFn) {
      const b = ctx.createBuffer(2, N, SR);
      b.copyToChannel(chans[0], 0); b.copyToChannel(chans[1], 1);
      const src = ctx.createBufferSource(); src.buffer = b;
      const out = ctx.createGain();
      if (gainFn) gainFn(out.gain);
      if (rt) {
        const dry = ctx.createGain(), wet = ctx.createGain(), conv = ctx.createConvolver(), tone = ctx.createBiquadFilter();
        conv.normalize = true; conv.buffer = impulse(ctx, rt, seed);
        tone.type = "lowpass"; tone.frequency.value = 6000;
        dry.gain.value = 1 - mix; wet.gain.value = mix * 1.6;
        src.connect(dry).connect(out); src.connect(tone).connect(conv).connect(wet).connect(out);
      } else src.connect(out);
      out.connect(ctx.destination);
      src.start(0);
    }
    // ma: the music and the beds fall silent under the wash
    const duck = (g) => { g.setValueAtTime(1, 0); g.setValueAtTime(1, plan.washAt); g.linearRampToValueAtTime(0.04, plan.washAt + 0.35); g.setValueAtTime(0.04, plan.endAt - 0.01); g.linearRampToValueAtTime(1, plan.endAt); };
    chain(bus.music, 1.8, 0.28, 3, duck);
    chain(bus.amb, 0, 0, 0, duck);
    chain(bus.sfx, 0.9, 0.15, 4);
    const out = await ctx.startRendering();
    // level: aim for a calm, broadcast-like loudness with a soft ceiling
    const L = out.getChannelData(0), Rr = out.getChannelData(1), n = Math.min(out.length, Math.ceil(plan.total * SR));
    let sum = 0; for (let i = 0; i < n; i++) sum += (L[i] * L[i] + Rr[i] * Rr[i]) / 2;
    const rms = Math.sqrt(sum / Math.max(1, n)), g = Math.pow(10, -17 / 20) / Math.max(rms, 1e-6);
    for (let i = 0; i < out.length; i++) {
      const fade = i > n - 1.2 * SR ? Math.max(0, (n - i) / (1.2 * SR)) : 1;
      for (const d of [L, Rr]) { let v = d[i] * g * fade; if (Math.abs(v) > 0.7) v = Math.sign(v) * (0.7 + 0.2 * Math.tanh((Math.abs(v) - 0.7) / 0.2)); d[i] = v; }
    }
    return out;
  }

  window.SCORE = { render, SR };
})();
