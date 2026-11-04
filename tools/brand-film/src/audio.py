"""Original procedural soundtrack: low ambience, mineral/metallic textures, build and resolve.
All sounds synthesised here (no third-party music). Event times follow the picture edit."""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile
from config import OUT, DURATION_S

SR = 48000
N = SR * DURATION_S
t = np.arange(N) / SR
rng = np.random.default_rng(3)


def env(start, attack, hold, release):
    e = np.zeros(N)
    a, h, r = (int(x * SR) for x in (attack, hold, release))
    i = int(start * SR)
    seg = np.concatenate([np.linspace(0, 1, a) ** 2, np.ones(h), np.linspace(1, 0, r) ** 2])
    seg = seg[:max(0, N - i)]
    e[i:i + len(seg)] = seg
    return e


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def tone(freqs, detune=0.003):
    out = np.zeros(N)
    for f in freqs:
        for d in (-detune, 0, detune):
            out += np.sin(2 * np.pi * f * (1 + d) * t + rng.uniform(0, 6.28))
    return out / (len(freqs) * 3)


def curve(points):
    xs, ys = zip(*points)
    return np.interp(t, xs, ys)


L = np.zeros(N)
R = np.zeros(N)


def add(sig, pan=0.0, gain=1.0):
    global L, R
    L += sig * gain * np.sqrt(0.5 * (1 - pan))
    R += sig * gain * np.sqrt(0.5 * (1 + pan))


# ---------------- ambience: low drone (D) with slow breathing
D1 = 36.71
drone = tone([D1, D1 * 2, D1 * 3.0], 0.002) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.07 * t))
drone_lvl = curve([(0, 0), (3, 0.5), (14, 0.6), (15.5, 0.35), (23, 0.45), (38, 0.6), (48, 0.85), (49, 0.3),
                   (53, 0.8), (60, 0.5)])
add(lp(drone, 220) * drone_lvl, 0, 0.55)
air = bp(rng.standard_normal(N), 900, 5000) * curve([(0, 0), (2, 0.05), (7, 0.05), (15, 0.03), (38, 0.02), (60, 0.03)])
add(air, -0.3, 0.6); add(bp(rng.standard_normal(N), 900, 5000) * curve([(0, 0), (2, 0.05), (60, 0.03)]), 0.3, 0.6)
# industrial rumble in scene 2
rum = lp(rng.standard_normal(N), 140) * env(7.0, 1.5, 6.0, 1.5)
add(rum, 0, 0.9)


# ---------------- metallic / mineral voices
def metal(at, f0=880, dur=2.5, gain=0.25, pan=0.0):
    ratios = [1, 2.76, 5.40, 8.93, 13.34]
    i = int(at * SR)
    n = min(int(dur * SR), N - i)
    tt = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f0 * r * tt) * np.exp(-tt * (2.2 + r * 0.9)) / (1 + r * 0.6) for r in ratios)
    sig = np.zeros(N); sig[i:i + n] = s * gain
    add(sig, pan)


def impact(at, gain=0.8, body=48):
    i = int(at * SR)
    n = min(int(3.0 * SR), N - i)
    tt = np.arange(n) / SR
    sub = np.sin(2 * np.pi * (body + 60 * np.exp(-tt * 18)) * tt) * np.exp(-tt * 2.6)
    nz = lp(rng.standard_normal(n), 900) * np.exp(-tt * 9) * 0.5
    sig = np.zeros(N); sig[i:i + n] = (sub + nz) * gain
    add(sig, 0)


def whoosh(start, dur, gain=0.3, rising=True, pan=0.0):
    i = int(start * SR); n = min(int(dur * SR), N - i)
    x = rng.standard_normal(n)
    out = np.zeros(n); blk = 1024
    for b in range(0, n, blk):
        p = b / n if rising else 1 - b / n
        fc = 300 + 4200 * p ** 2
        out[b:b + blk] = bp(x[b:b + blk], fc * 0.6, min(fc * 1.6, 20000))[: len(x[b:b + blk])]
    e = np.sin(np.linspace(0, np.pi, n)) ** 2
    sig = np.zeros(N); sig[i:i + n] = out * e * gain
    add(sig, pan)


def tick(at, gain=0.12, f=2400, pan=0.0):
    i = int(at * SR); n = int(0.05 * SR)
    tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 140) + rng.standard_normal(n) * np.exp(-tt * 300) * 0.3
    sig = np.zeros(N); sig[i:i + n] = s * gain
    add(sig, pan)


# Scene 1
metal(2.5, 660, 4.0, 0.10, 0.2)
whoosh(5.6, 1.4, 0.18)
impact(6.95, 0.35, 42)
# Scene 2: conveyor texture + gap
for k in range(40):
    tick(8.4 + k * 0.15 + rng.uniform(0, 0.04), 0.03, rng.uniform(1500, 3000), rng.uniform(-0.6, 0.6))
metal(9.7, 520, 2.0, 0.07, 0.4)
metal(11.1, 990, 2.0, 0.06, -0.3)
whoosh(13.6, 2.4, 0.22)                     # by-product lifts
# Scene 3: convergence & reveal
whoosh(16.0, 2.4, 0.25)
impact(19.35, 0.75, 46)                     # mark settles
metal(19.45, 740, 4.5, 0.18, 0)             # light sweep shimmer
metal(20.6, 1110, 3.0, 0.07, 0.3)
# Scene 4: pulse + UI
bpm = 100; beat = 60 / bpm
for k in range(int(15 / beat)):
    at = 23.4 + k * beat
    if at > 38.8: break
    impact(at, 0.10 + 0.04 * (k % 4 == 0), 52)
    tick(at + beat / 2, 0.04, 3200, 0.3 * (-1) ** k)
for st in (24.0, 27.67, 31.73, 35.67):
    whoosh(st - 0.35, 0.7, 0.10)
    tick(st, 0.10, 2000)
    for j in range(4):
        tick(st + 0.35 + j * 0.3, 0.05, 2800 + j * 200, -0.3)
metal(38.2, 880, 2.0, 0.09, 0)
# Scene 5: build
for k, at in enumerate([40.7, 42.17, 43.63, 45.1]):
    metal(at, 587.3 * (1.122 ** k), 2.5, 0.12, 0.5 - k * 0.33)
rise = hp(rng.standard_normal(N), 2000) * curve([(40, 0), (45, 0.03), (47.2, 0.07), (47.4, 0)])
add(rise, 0)
whoosh(48.2, 1.6, 0.25, False)
# Scene 6: finale
whoosh(49.2, 2.6, 0.22)
impact(52.4, 0.95, 40)
metal(52.6, 587.3, 6.0, 0.20, 0)
metal(54.4, 880, 3.0, 0.08, -0.2)

# ---------------- harmonic pad: Dm – Bb – F – C through the workflow, resolve to D(sus) at finale
CH = {"Dm": [73.42, 110.0, 174.61, 220.0, 293.66], "Bb": [58.27, 116.54, 174.61, 233.08, 293.66],
      "F": [87.31, 130.81, 174.61, 220.0, 261.63], "C": [65.41, 130.81, 196.0, 261.63, 329.63],
      "Dsus": [73.42, 110.0, 146.83, 220.0, 329.63, 440.0], "Dm9": [73.42, 110.0, 174.61, 220.0, 329.63]}
plan = [("Dm9", 15.0, 8.5, 0.10), ("Dm", 23.0, 4.0, 0.10), ("Bb", 27.2, 4.0, 0.11), ("F", 31.3, 4.0, 0.12),
        ("C", 35.3, 4.4, 0.12), ("Dm", 39.6, 3.2, 0.13), ("Bb", 42.6, 2.8, 0.15), ("C", 45.3, 3.8, 0.17),
        ("Dsus", 52.2, 7.8, 0.20)]
for name, st, d, g in plan:
    sig = tone(CH[name], 0.0035)
    sig = lp(sig + 0.3 * np.sign(sig) * np.abs(sig) ** 0.5 * 0.2, 1800)
    add(sig * env(st, 1.2, max(d - 1.2, 0), 2.6), 0, g)

# ---------------- space & master
mix_ = np.stack([L, R], 1)
ir_n = int(2.8 * SR)
irt = np.arange(ir_n) / SR
for c in range(2):
    ir = rng.standard_normal(ir_n) * np.exp(-irt * 2.4)
    ir = lp(ir, 5000)
    wet = fftconvolve(mix_[:, c], ir)[:N] * 0.012
    mix_[:, c] = mix_[:, c] + wet
mix_ = hp(mix_.T, 28).T
fade = np.ones(N); fade[-int(1.2 * SR):] = np.linspace(1, 0, int(1.2 * SR)) ** 1.5
mix_ *= fade[:, None]
peak = np.abs(mix_).max()
mix_ = np.tanh(mix_ / peak * 1.3) / np.tanh(1.3) * 0.89
wavfile.write(f"{OUT}/soundtrack.wav", SR, (mix_ * 32767).astype(np.int16))
print("ok", peak)
