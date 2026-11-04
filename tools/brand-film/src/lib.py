"""Rendering primitives: easing, sprites (premultiplied RGBA float32), text, compositing."""
import functools
import math

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from config import EASE, FONT, H, PAL, TEXT_SOFT_EDGE, W

RAQM = ImageFont.Layout.RAQM


# ------------------------------------------------------------------ easing / timing
@functools.lru_cache(maxsize=None)
def _bezier_table(p):
    x1, y1, x2, y2 = p
    t = np.linspace(0, 1, 2048)
    bx = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3
    by = 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3
    return bx, by


def ease(t, kind="out"):
    t = min(max(t, 0.0), 1.0)
    bx, by = _bezier_table(EASE[kind])
    return float(np.interp(t, bx, by))


def prog(f, start, dur, kind="out"):
    """Eased 0..1 progress of an event starting at frame `start` lasting `dur` frames."""
    return ease((f - start) / max(dur, 1), kind)


def lin(f, start, dur):
    return min(max((f - start) / max(dur, 1), 0.0), 1.0)


def mix(a, b, t):
    return a + (b - a) * t


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def spring(t, freq=2.2, damp=5.0):
    """Critically-damped-ish spring 0..1 with gentle overshoot."""
    if t <= 0:
        return 0.0
    return 1 - math.exp(-damp * t) * math.cos(freq * math.pi * t)


# ------------------------------------------------------------------ sprites
class Sprite:
    """Premultiplied RGBA float32 image."""

    def __init__(self, rgba):
        self.p = rgba.astype(np.float32)  # premultiplied rgb in [...,:3], alpha in [...,3]

    @property
    def h(self):
        return self.p.shape[0]

    @property
    def w(self):
        return self.p.shape[1]

    @staticmethod
    def from_pil(img):
        a = np.asarray(img.convert("RGBA"), np.float32) / 255.0
        a[..., :3] *= a[..., 3:4]
        return Sprite(a)

    @staticmethod
    def from_file(path):
        im = cv2.imread(path, cv2.IMREAD_UNCHANGED).astype(np.float32) / 255.0
        rgb = im[..., [2, 1, 0]]
        a = im[..., 3:4]
        return Sprite(np.dstack([rgb * a, a]))

    def scaled(self, k):
        if abs(k - 1) < 1e-4:
            return self
        interp = cv2.INTER_AREA if k < 1 else cv2.INTER_LANCZOS4
        out = cv2.resize(self.p, None, fx=k, fy=k, interpolation=interp)
        out = np.clip(out, 0, None)
        out[..., :3] = np.minimum(out[..., :3], out[..., 3:4])
        return Sprite(out)


def blit(frame, spr, x, y, opacity=1.0, mask=None, mode="over"):
    """Composite sprite with top-left at float (x, y). Subpixel via warpAffine.
    mask: optional (h, w) float array multiplied into alpha (sprite space)."""
    if opacity <= 0.002:
        return
    p = spr.p
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    if mask is not None:
        p = p * mask[..., None]
    if fx > 0.02 or fy > 0.02:
        M = np.float32([[1, 0, fx], [0, 1, fy]])
        p = cv2.warpAffine(p, M, (p.shape[1] + 1, p.shape[0] + 1), flags=cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    h, w = p.shape[:2]
    x0, y0 = max(ix, 0), max(iy, 0)
    x1, y1 = min(ix + w, W), min(iy + h, H)
    if x1 <= x0 or y1 <= y0:
        return
    sub = p[y0 - iy:y1 - iy, x0 - ix:x1 - ix]
    rgb, a = sub[..., :3] * opacity, sub[..., 3:4] * opacity
    dst = frame[y0:y1, x0:x1]
    if mode == "add":
        dst += rgb
    else:
        dst *= (1 - a)
        dst += rgb


def blit_center(frame, spr, cx, cy, opacity=1.0, mask=None, scale=1.0, mode="over"):
    if scale != 1.0:
        spr = spr.scaled(scale)
        if mask is not None:
            mask = cv2.resize(mask, (spr.w, spr.h), interpolation=cv2.INTER_LINEAR)
    blit(frame, spr, cx - spr.w / 2, cy - spr.h / 2, opacity, mask, mode)


# ------------------------------------------------------------------ text
def is_arabic(s):
    return any("؀" <= ch <= "ۿ" for ch in s)


@functools.lru_cache(maxsize=64)
def font(key, size):
    return ImageFont.truetype(FONT[key], size, layout_engine=RAQM)


@functools.lru_cache(maxsize=512)
def text(s, key, size, color=PAL["off"], track=0.0, pad=6):
    """Render a line of text to a Sprite. Arabic: RTL shaping via raqm. Latin: optional tracking (em)."""
    f = font(key, size)
    asc, desc = f.getmetrics()
    col = tuple(int(c * 255) for c in color)
    if is_arabic(s):
        w = int(f.getlength(s, direction="rtl", language="ar")) + 2 * pad
        hgt = asc + desc + 2 * pad + int(size * 0.25)
        img = Image.new("RGBA", (w, hgt), col + (0,))
        d = ImageDraw.Draw(img)
        d.text((w - pad, pad + int(size * 0.25) + asc), s, font=f, fill=col + (255,), anchor="rs",
               direction="rtl", language="ar", features=["kern", "liga", "calt"])
    else:
        tr = track * size
        widths = [f.getlength(ch) for ch in s]
        w = int(sum(widths) + tr * (len(s) - 1)) + 2 * pad
        hgt = asc + desc + 2 * pad
        img = Image.new("RGBA", (max(w, 1), hgt), col + (0,))
        d = ImageDraw.Draw(img)
        x = pad
        for ch, cw in zip(s, widths):
            d.text((x, pad + asc), ch, font=f, fill=col + (255,), anchor="ls")
            x += cw + tr
    sp = Sprite.from_pil(img)
    sp.rtl = is_arabic(s)
    return sp


def wipe_mask(w, h, p, direction="rtl", soft=TEXT_SOFT_EDGE):
    """Soft reveal mask across x. direction 'rtl' reveals from the right edge (Arabic reading)."""
    x = np.arange(w, dtype=np.float32)
    if direction == "rtl":
        thr = w - p * (w + soft)
        m = np.clip((x - thr) / soft, 0, 1)
    elif direction == "ltr":
        thr = p * (w + soft)
        m = np.clip((thr - x) / soft, 0, 1)
    else:  # from centre outward
        half = w / 2
        thr = p * (half + soft)
        m = np.clip((thr - np.abs(x - half)) / soft, 0, 1)
    m = smooth(m)
    return np.broadcast_to(m[None, :], (h, w)).astype(np.float32)


def show_text(frame, spr, cx, cy, f, t_in, t_out=None, dur=26, rise=16, direction=None, opacity=1.0,
              out_dur=18):
    """Kinetic text: directional soft wipe + rise + settle; gentle fade/lift on exit."""
    if f < t_in:
        return
    p = prog(f, t_in, dur, "out")
    o = opacity * min(1.0, p * 1.6)
    dy = (1 - p) * rise
    if t_out is not None and f >= t_out:
        q = prog(f, t_out, out_dur, "in")
        o *= 1 - q
        dy -= q * rise * 0.6
    if o <= 0.002:
        return
    if direction is None:
        direction = "rtl" if getattr(spr, "rtl", False) else "ltr"
    m = wipe_mask(spr.w, spr.h, prog(f, t_in, dur * 1.25, "soft"), direction) if p < 1 else None
    blit(frame, spr, cx - spr.w / 2, cy - spr.h / 2 + dy, o, m)


# ------------------------------------------------------------------ frame helpers
def solid(color):
    f = np.empty((H, W, 3), np.float32)
    f[:] = color
    return f


@functools.lru_cache(maxsize=4)
def vignette_map(strength):
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    nx, ny = (x - W / 2) / (W / 2), (y - H / 2) / (H / 2)
    r = np.sqrt(nx ** 2 * 0.85 + ny ** 2)
    return (1 - strength * smooth((r - 0.35) / 1.0))[..., None].astype(np.float32)


@functools.lru_cache(maxsize=1)
def grain_bank():
    rng = np.random.default_rng(7)
    bank = []
    for _ in range(12):
        g = rng.standard_normal((H // 2, W // 2)).astype(np.float32)
        g = cv2.resize(g, (W, H), interpolation=cv2.INTER_LINEAR)
        bank.append(g[..., None])
    return bank


def finish(frame, f, grain=0.018, vig=0.42):
    frame *= vignette_map(vig)
    frame += grain_bank()[f % 12] * grain
    np.clip(frame, 0, 1, out=frame)
    return frame


def glow(frame, mask_rgb, sigma=18, k=0.6):
    """Additive soft bloom from an rgb highlight image."""
    small = cv2.resize(mask_rgb, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), sigma / 4)
    frame += cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR) * k


# ------------------------------------------------------------------ vector overlay (cv2, AA)
SHIFT = 4
SC = 1 << SHIFT


def _pt(p):
    return (int(round(p[0] * SC)), int(round(p[1] * SC)))


def draw_alpha(fn, bbox=None):
    """Run fn(mask_uint8) on a blank full-frame mask and return float alpha."""
    m = np.zeros((H, W), np.uint8)
    fn(m)
    return m.astype(np.float32) / 255.0


def paint(frame, alpha, color, opacity=1.0, mode="over"):
    a = (alpha * opacity)[..., None]
    if mode == "add":
        frame += a * np.asarray(color, np.float32)
    else:
        frame *= (1 - a)
        frame += a * np.asarray(color, np.float32)


def aa_line(m, p1, p2, width=2, val=255):
    cv2.line(m, _pt(p1), _pt(p2), val, max(1, int(round(width))), cv2.LINE_AA, SHIFT)


def aa_polyline(m, pts, width=2, closed=False, val=255):
    arr = np.array([_pt(p) for p in pts], np.int32).reshape(-1, 1, 2)
    cv2.polylines(m, [arr], closed, val, max(1, int(round(width))), cv2.LINE_AA, SHIFT)


def aa_circle(m, c, r, width=-1, val=255):
    cv2.circle(m, _pt(c), int(round(r * SC)), val, width if width < 0 else max(1, int(width)), cv2.LINE_AA, SHIFT)


def aa_poly_fill(m, pts, val=255):
    arr = np.array([_pt(p) for p in pts], np.int32).reshape(-1, 1, 2)
    cv2.fillPoly(m, [arr], val, cv2.LINE_AA, SHIFT)


def dashed(m, p1, p2, dash=14, gap=10, width=2, upto=1.0):
    p1, p2 = np.array(p1, float), np.array(p2, float)
    L = np.linalg.norm(p2 - p1)
    d = (p2 - p1) / max(L, 1e-6)
    s = 0.0
    while s < L * upto:
        e = min(s + dash, L * upto)
        aa_line(m, p1 + d * s, p1 + d * e, width)
        s += dash + gap


def partial_polyline(pts, t):
    """Points of a polyline truncated to fraction t of its length."""
    pts = [np.array(p, float) for p in pts]
    seg = [np.linalg.norm(b - a) for a, b in zip(pts, pts[1:])]
    total = sum(seg) * t
    out = [pts[0]]
    for (a, b), L in zip(zip(pts, pts[1:]), seg):
        if total >= L:
            out.append(b)
            total -= L
        else:
            out.append(a + (b - a) * (total / max(L, 1e-6)))
            break
    return out, out[-1]
