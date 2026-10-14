"""Score and sound for 'Five Views of Tokyo' — synthesized, deterministic.

Japanese palette only: shamisen (with sawari buzz), koto, shakuhachi, taiko, shime-daiko,
hyoshigi clappers, a temple bell, a wind chime. Miyako-bushi mode on E (E F A B C).
Foley follows the material: paper (baren rub, scroll slide, seal), water, rain, birds.

    python3 tools/score.py  ->  assets/audio/score_raw.wav (then loudness-normalised with ffmpeg)
"""
import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
DUR = 50.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
amb = np.zeros((N, 2))

NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(name):
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[n] + 12 * (o + 1) - 69) / 12)


def place(bus, x, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= N:
        return
    x = x[: N - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    bus[i : i + len(x), 0] += x * l * 1.414
    bus[i : i + len(x), 1] += x * r * 1.414


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lowpass(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="low", fs=SR, output="sos"), x)


def highpass(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="high", fs=SR, output="sos"), x)


# ---------------- instruments ----------------
def pluck(f, dur, damp=0.996, bright=0.6, seed=0):
    """Karplus-Strong, computed one delay-line block at a time."""
    n = int(dur * SR)
    L = max(2, int(round(SR / f)))
    r = np.random.default_rng(seed)
    buf = r.uniform(-1, 1, L)
    buf = lowpass(buf, 2000 + 9000 * bright, 1)
    out = np.zeros(n + L + 1)
    out[:L] = buf
    i = L
    while i < n + 1:
        j = min(i + L, n + 1)
        prev = out[i - L : j - L]
        prev2 = out[i - L - 1 : j - L - 1] if i - L - 1 >= 0 else np.concatenate([[0.0], out[i - L : j - L - 1]])
        out[i:j] = damp * 0.5 * (prev + prev2)
        i = j
    y = out[:n]
    y *= 1 - np.exp(-np.arange(n) / (0.002 * SR))
    return y / (np.max(np.abs(y)) + 1e-9)


def koto(f, dur=2.4, seed=0):
    y = pluck(f, dur, damp=0.9965, bright=0.75, seed=seed)
    return y * env_exp(len(y), dur * 0.45)


def shamisen(f, dur=1.4, seed=0, sawari=0.35):
    y = pluck(f, dur, damp=0.993, bright=0.9, seed=seed)
    # sawari: a buzzing halo that rides the string's own envelope and outlives the attack
    e = lowpass(np.abs(y), 30, 1)
    buzz = bandpass(rng.standard_normal(len(y)), 2200, 6000) * e * sawari * 3
    y = y + buzz + 0.15 * np.tanh(3 * y)
    return y * env_exp(len(y), dur * 0.4)


def shakuhachi(f, dur, meri=False, slide=True, vib=True):
    n = int(dur * SR)
    t = np.arange(n) / SR
    pitch = np.full(n, f)
    if slide:
        g = np.clip(t / 0.18, 0, 1)
        pitch *= 2 ** ((-1 + g) / 12)
    if vib:
        pitch *= 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.5) / 0.4, 0, 1)
    if meri:
        g = np.clip((t - (dur - 0.45)) / 0.35, 0, 1)
        pitch *= 2 ** (-1.0 * g / 12)
    ph = 2 * np.pi * np.cumsum(pitch) / SR
    tone = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.07 * np.sin(3 * ph)
    breath = bandpass(rng.standard_normal(n), f * 1.2, min(f * 6, 16000)) * 0.5
    a = np.clip(t / 0.22, 0, 1) * np.clip((dur - t) / 0.4, 0, 1)
    chiff = np.exp(-t / 0.06) * bandpass(rng.standard_normal(n), 1500, 5000) * 0.6
    return (tone * (0.75 + 0.25 * np.clip(t / 0.6, 0, 1)) + breath * (0.6 - 0.3 * np.clip(t / 0.8, 0, 1)) + chiff) * a


def taiko(gain=1.0, low=55):
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    f = low + (110 - low) * np.exp(-t / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.42)
    skin = lowpass(rng.standard_normal(n), 900) * np.exp(-t / 0.03) * 0.6
    return (body + skin) * gain


def shime():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = 260 + 90 * np.exp(-t / 0.02)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.08) + bandpass(rng.standard_normal(n), 1500, 6000) * np.exp(-t / 0.015) * 0.5)


def hyoshigi(gain=1.0):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * 1870 * t) * 0.8 + np.sin(2 * np.pi * 2710 * t) * 0.5 + np.sin(2 * np.pi * 980 * t) * 0.4) * np.exp(-t / 0.022)
    y += highpass(rng.standard_normal(n), 3000) * np.exp(-t / 0.004) * 0.9
    return y * gain


def bell(f=98.0, dur=8.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for ratio, amp, tau in [(0.5, 0.5, 6.0), (1, 1.0, 4.5), (1.19, 0.5, 3.0), (1.56, 0.45, 2.6), (2.0, 0.4, 2.2), (2.74, 0.3, 1.5), (3.0, 0.25, 1.2), (4.1, 0.15, 0.8)]:
        for det in (0, 0.35):
            y += amp * np.sin(2 * np.pi * (f * ratio + det) * t) * np.exp(-t / tau) * 0.5
    y += lowpass(rng.standard_normal(n), 400) * np.exp(-t / 0.05) * 0.8
    return y


def furin():
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * fr * t) * np.exp(-t / tau) for fr, a, tau in [(3150, 1, 0.9), (5620, 0.4, 0.5), (8300, 0.2, 0.25)])
    return y * (1 - np.exp(-t / 0.001))


def seal_thump():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * 85 * t) * np.exp(-t / 0.06) + lowpass(rng.standard_normal(n), 500) * np.exp(-t / 0.02) * 0.8
    peel = np.zeros(n)
    k = int(0.09 * SR)
    peel[k:] = highpass(rng.standard_normal(n - k), 2500) * np.exp(-np.arange(n - k) / (0.03 * SR)) * 0.15
    return y + peel


def baren(dur=0.42):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = bandpass(rng.standard_normal(n), 300, 1600)
    mod = 0.55 + 0.45 * np.sin(2 * np.pi * 7 * t) ** 2
    a = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.7
    return x * mod * a


def whoosh(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = bandpass(rng.standard_normal(n), 200, 2400)
    return x * np.sin(np.pi * t / dur) ** 2


def chirp(f0, f1, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.linspace(f0, f1, n)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / dur)


# ---------------- ambience beds ----------------
def bed(fn, t0, t1, fade=0.8):
    n = int((t1 - t0) * SR)
    x = fn(n)
    a = np.ones(n)
    k = int(fade * SR)
    a[:k] = np.linspace(0, 1, k)
    a[-k:] = np.linspace(1, 0, k)
    return x * a


def water(n):
    x = lowpass(rng.standard_normal(n), 700)
    m = lowpass(rng.standard_normal(n), 0.6, 1)
    m = 0.5 + 0.5 * m / (np.max(np.abs(m)) + 1e-9)
    return x * m


def rain(n):
    x = bandpass(rng.standard_normal(n), 900, 9000) * 0.6
    drops = np.zeros(n)
    idx = rng.integers(0, n, n // 300)
    drops[idx] = rng.uniform(-1, 1, len(idx))
    drops = bandpass(drops, 1500, 7000) * 3
    return x + drops


def wind(n):
    return bandpass(rng.standard_normal(n), 150, 700) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.17 * np.arange(n) / SR))


# ================= the cue sheet =================
# opening: clappers accelerate, the kabuki curtain call, then the blocks print
for t in [0.30, 0.95, 1.42, 1.75, 1.97, 2.11, 2.20]:
    place(sfx, hyoshigi(0.6), t, pan=0.1)
place(sfx, hyoshigi(1.0), 2.29, pan=0.1)
for t in [2.3, 2.7, 3.1, 3.5, 39.15, 39.5, 39.85]:
    place(sfx, baren(), t, pan=-0.2, gain=0.35)
for t in [4.55, 12.35, 21.35, 31.95, 40.85]:
    place(sfx, seal_thump(), t, gain=0.7)
for t0, t1 in [(9.0, 11.4), (18.6, 20.4), (28.2, 31.0), (36.8, 39.0)]:
    place(sfx, whoosh(t1 - t0), t0, gain=0.22)

# 1 · dawn over the bay
place(amb, bed(water, 3.4, 10.4), 3.4, gain=0.22)
for i, t in enumerate([4.6, 4.75, 5.9, 6.05, 6.2, 7.6, 7.72]):
    place(amb, chirp(3600 + 300 * (i % 3), 4800, 0.07), t, pan=0.5, gain=0.08)
for f, d, t, meri in [("A4", 1.7, 3.9, False), ("B4", 0.9, 5.7, False), ("C5", 1.6, 6.7, True), ("B4", 1.0, 8.5, True)]:
    place(music, shakuhachi(hz(f), d, meri=meri), t, pan=-0.15, gain=0.32)
for f, t in [("E3", 3.85), ("B3", 5.65), ("E3", 7.4)]:
    place(music, koto(hz(f), 3.0, seed=int(t * 10)), t, pan=0.25, gain=0.35)

# slide 1: a koto glissando turns the season
for i, f in enumerate(["E4", "F4", "A4", "B4", "C5", "E5", "F5", "A5", "B5"]):
    place(music, koto(hz(f), 2.2, seed=40 + i), 9.55 + i * 0.075, pan=-0.3 + i * 0.07, gain=0.28)

# 2 · cherry blossoms on the river
place(amb, bed(water, 11.0, 18.9), 11.0, gain=0.14)
place(amb, bed(wind, 11.0, 18.9), 11.0, gain=0.06)
mel = [("E5", 0), ("C5", 0.5), ("B4", 0.75), ("A4", 1.5), ("B4", 2.25), ("C5", 2.5), ("E5", 3.0), ("F5", 3.75), ("E5", 4.0), ("C5", 4.75), ("B4", 5.0), ("A4", 5.5)]
for i, (f, dt) in enumerate(mel):
    place(music, koto(hz(f), 2.0, seed=60 + i), 12.0 + dt, pan=0.2, gain=0.3)
for t in [11.6, 13.6, 15.6, 17.6]:
    place(music, koto(hz("E3"), 2.6, seed=int(t * 7)), t, pan=-0.2, gain=0.3)
place(music, shakuhachi(hz("E4"), 2.6, meri=True), 15.3, pan=-0.3, gain=0.2)

# slide 2: a shime-daiko roll tightens into the rain
for k in range(16):
    t = 18.75 + 1.55 * (1 - (1 - k / 15) ** 1.6)
    place(music, shime(), t, pan=0.15, gain=0.12 + 0.2 * k / 15)
place(music, taiko(1.0), 20.38, gain=0.55)

# 3 · rain at the crossing
place(amb, bed(rain, 19.4, 29.6, fade=1.2), 19.4, gain=0.18)
pat = ["E3", "E3", "B3", "E3", "F3", "E3", "A3", "E3"]
t, k = 20.45, 0
while t < 27.7:
    f = pat[k % 8]
    place(music, shamisen(hz(f), 0.9, seed=100 + k), t, pan=0.3 if k % 2 else -0.05, gain=0.26 if k % 4 == 0 else 0.18)
    t += 0.25
    k += 1
for t in [22.4, 24.4, 26.4]:
    place(music, taiko(0.7), t, gain=0.4)
thunder = lowpass(rng.standard_normal(int(3.0 * SR)), 140) * np.sin(np.pi * np.linspace(0, 1, int(3.0 * SR))) ** 2
place(amb, thunder, 23.2, gain=0.35)

# slide 3: one long breath
place(music, shakuhachi(hz("B4"), 2.5, meri=True), 28.4, pan=-0.1, gain=0.28)

# 4 · the great lantern at Asakusa
place(music, bell(98.0, 9.0), 31.6, gain=0.32)
for t in [33.0, 34.4, 35.6]:
    place(amb, furin(), t, pan=0.55, gain=0.07)
for f, t in [("A3", 32.6), ("E4", 34.0), ("B3", 35.3)]:
    place(music, koto(hz(f), 2.6, seed=int(t * 9)), t, pan=0.2, gain=0.26)
place(amb, bed(wind, 31.0, 37.0), 31.0, gain=0.05)

# slide 4: a taiko heartbeat into the night
for t in [37.0, 37.32, 38.0, 38.3, 38.9, 39.15]:
    place(music, taiko(0.8, low=50), t, gain=0.38)

# 5 · the bay at night
place(amb, bed(water, 38.6, 46.2, fade=0.6), 38.6, gain=0.2)
for t in [39.9, 40.8, 41.6]:
    place(music, taiko(0.5, low=48), t, gain=0.22)
place(music, shamisen(hz("E3"), 3.2, seed=301, sawari=0.6), 40.9, pan=-0.2, gain=0.3)
for t0, g in [(42.2, 1.0), (43.7, 0.6)]:
    n = int(1.5 * SR)
    tt = np.arange(n) / SR
    boom = lowpass(rng.standard_normal(n), 220) * np.exp(-tt / 0.35) * 1.2 + np.sin(2 * np.pi * 46 * tt) * np.exp(-tt / 0.3)
    place(sfx, boom, t0 - 0.05, gain=0.42 * g)
    crackle = np.zeros(int(1.8 * SR))
    idx = rng.integers(int(0.35 * SR), len(crackle), 70)
    crackle[idx] = rng.uniform(-1, 1, len(idx))
    crackle = highpass(crackle, 2500) * 4 * np.linspace(1, 0.2, len(crackle))
    place(sfx, crackle, t0, pan=0.2, gain=0.12 * g)
place(music, shamisen(hz("B2"), 3.0, seed=302, sawari=0.6), 43.0, pan=0.2, gain=0.26)
for f, d, t, meri in [("E5", 0.9, 44.0, False), ("C5", 0.7, 44.95, False), ("B4", 1.0, 45.0 + 0.7, True)]:
    place(music, shakuhachi(hz(f), d, meri=meri), t, pan=-0.15, gain=0.28)

# the wash back to paper, then the curtain
place(sfx, baren(1.3), 46.05, gain=0.25)
place(sfx, hyoshigi(0.9), 47.35, pan=0.1)
place(sfx, hyoshigi(1.0), 47.55, pan=0.1)
place(sfx, seal_thump(), 47.9, gain=0.8)
place(music, bell(110.0, 6.0), 48.2, gain=0.2)

# ---------------- one room ----------------
def reverb(x, rt=1.4, mix=0.22, seed=3):
    r = np.random.default_rng(seed)
    n = int(rt * SR)
    tt = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = r.standard_normal(n) * np.exp(-tt / (rt / 6.9))
        ir = lowpass(ir, 6000)
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        out[:, ch] = signal.fftconvolve(x[:, ch], ir)[: len(x)]
    return x * (1 - mix) + out * mix


music = reverb(music, 1.8, 0.28)
sfx = reverb(sfx, 0.9, 0.15, seed=4)

# ma: cut every tail at the wash, so the silence is real
t = np.arange(N) / SR
duck = np.ones(N)
duck = np.where((t > 46.0) & (t < 47.3), np.clip(1 - (t - 46.0) / 0.35, 0.04, 1), duck)
duck = np.where(t >= 47.3, 1.0, duck)
mix = (music + amb) * duck[:, None] + sfx  # the wash's paper rub stays audible in the silence
mix *= np.clip((DUR - t) / 1.2, 0, 1)[:, None]
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89
sf.write("assets/audio/score_raw.wav", mix.astype(np.float32), SR)
print("ok", mix.shape)
