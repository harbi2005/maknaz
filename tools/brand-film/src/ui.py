"""Prototype interface elements for the workflow scene (illustrative concept UI, RTL Arabic).
Every element is pre-rendered once with PIL (2x supersampled) and cached as a Sprite."""
import functools

import numpy as np
from PIL import Image, ImageDraw

from config import PAL, shade
from lib import Sprite, font, is_arabic

SS = 2  # supersample


def c255(c, a=1.0):
    return tuple(int(round(v * 255)) for v in c) + (int(round(a * 255)),)


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def rrect(self, x0, y0, x1, y1, r, fill=None, outline=None, width=1, dash=False):
        box = [x0 * SS, y0 * SS, x1 * SS - 1, y1 * SS - 1]
        if dash and outline:
            # dashed rounded outline: draw solid then punch gaps
            self.d.rounded_rectangle(box, r * SS, fill=fill, outline=outline, width=width * SS)
            gap = Image.new("L", self.img.size, 255)
            gd = ImageDraw.Draw(gap)
            for x in range(int(x0 * SS) + 18, int(x1 * SS), 26):
                gd.rectangle([x, 0, x + 10, self.img.size[1]], fill=0)
            for y in range(int(y0 * SS) + 18, int(y1 * SS), 26):
                gd.rectangle([0, y, int(x0 * SS) + width * SS + 2, y + 10], fill=0)
                gd.rectangle([int(x1 * SS) - width * SS - 3, y, self.img.size[0], y + 10], fill=0)
            inner = Image.new("L", self.img.size, 0)
            ImageDraw.Draw(inner).rounded_rectangle([box[0] + width * SS + 1, box[1] + width * SS + 1,
                                                     box[2] - width * SS - 1, box[3] - width * SS - 1],
                                                    max(1, (r - width) * SS), fill=255)
            from PIL import ImageChops
            m = ImageChops.lighter(gap, inner)
            a = self.img.getchannel("A")
            self.img.putalpha(ImageChops.multiply(a, m))
            return
        self.d.rounded_rectangle(box, r * SS, fill=fill, outline=outline, width=width * SS)

    def circle(self, cx, cy, r, fill=None, outline=None, width=1):
        self.d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=fill, outline=outline,
                       width=width * SS)

    def line(self, pts, fill, width=1):
        self.d.line([(x * SS, y * SS) for x, y in pts], fill=fill, width=width * SS, joint="curve")

    def text(self, x, y, s, key, size, color, anchor=None, track=0.0):
        """x,y = anchor point. Arabic defaults to right-aligned ('rs'), Latin left ('ls')."""
        f = font(key, size * SS)
        ar = is_arabic(s)
        anchor = anchor or ("rs" if ar else "ls")
        if ar:
            self.d.text((x * SS, y * SS), s, font=f, fill=color, anchor=anchor, direction="rtl", language="ar")
        elif track:
            tr = track * size * SS
            total = sum(f.getlength(ch) for ch in s) + tr * (len(s) - 1)
            cx = x * SS - (total if anchor[0] == "r" else total / 2 if anchor[0] == "m" else 0)
            for ch in s:
                self.d.text((cx, y * SS), ch, font=f, fill=color, anchor="l" + anchor[1])
                cx += f.getlength(ch) + tr
        else:
            self.d.text((x * SS, y * SS), s, font=f, fill=color, anchor=anchor)

    def paste(self, pil_img, x, y):
        im = pil_img.resize((pil_img.width * SS, pil_img.height * SS), Image.LANCZOS)
        self.img.alpha_composite(im, (int(x * SS), int(y * SS)))

    def sprite(self):
        return Sprite.from_pil(self.img.resize((self.w, self.h), Image.LANCZOS))


OFF, SAND, GRAY, CU = PAL["off"], PAL["sand"], PAL["gray"], PAL["copper"]
PANEL = shade("charcoal", 1.18)
PANEL2 = shade("charcoal", 1.45)
LINE = shade("gray", 0.45)


# ---------------------------------------------------------------- icons (line art, board style)
def icon(cv, kind, cx, cy, s, color, width=2):
    """Simple line icons echoing the board: layers, data, evaluation, link, industry."""
    col = c255(color)
    d = cv.d
    k = s / 24.0
    P = lambda x, y: ((cx + x * k) * SS, (cy + y * k) * SS)
    W_ = max(1, int(width * SS))
    if kind == "layers":
        for dy in (-6, 0, 6):
            d.line([P(-11, dy), P(0, dy - 6), P(11, dy), P(0, dy + 6), P(-11, dy)], fill=col, width=W_, joint="curve")
    elif kind == "data":
        pts = [(-9, 6), (0, -8), (9, 4)]
        d.line([P(*pts[0]), P(*pts[1]), P(*pts[2]), P(*pts[0])], fill=col, width=W_)
        for x, y in pts:
            d.ellipse([*P(x - 3, y - 3), *P(x + 3, y + 3)], fill=c255(shade("charcoal", 1.2)), outline=col, width=W_)
    elif kind == "eval":
        d.ellipse([*P(-10, -10), *P(6, 6)], outline=col, width=W_)
        d.line([P(5, 5), P(11, 11)], fill=col, width=W_)
        d.line([P(-6, 1), P(-2, -3), P(1, 0), P(4, -5)], fill=col, width=W_)
    elif kind == "link":
        d.rounded_rectangle([*P(-12, -4), *P(1, 4)], radius=4 * k * SS, outline=col, width=W_)
        d.rounded_rectangle([*P(-1, -4), *P(12, 4)], radius=4 * k * SS, outline=col, width=W_)
    elif kind == "industry":
        d.line([P(-12, 10), P(-12, -2), P(-5, -6), P(-5, -2), P(2, -6), P(2, -2), P(9, -6), P(9, -12), P(12, -12),
                P(12, 10), P(-12, 10)], fill=col, width=W_, joint="curve")
        for x in (-8, -2, 4):
            d.rectangle([*P(x, 3), *P(x + 3, 6)], outline=col, width=max(1, W_ // 2))
    elif kind == "truck":
        d.rounded_rectangle([*P(-13, -7), *P(3, 6)], radius=1.5 * k * SS, outline=col, width=W_)
        d.line([P(3, -3), P(8, -3), P(12, 2), P(12, 6), P(3, 6)], fill=col, width=W_, joint="curve")
        for x in (-8, 7):
            d.ellipse([*P(x - 3, 6), *P(x + 3, 12)], fill=c255(shade("charcoal", 1.3)), outline=col, width=W_)
    elif kind == "mine":
        d.line([P(-10, 12), P(0, -9), P(10, 12)], fill=col, width=W_, joint="curve")
        d.line([P(-6, 4), P(6, 4)], fill=col, width=W_)
        d.ellipse([*P(-4, -14), *P(4, -6)], outline=col, width=W_)
        d.line([P(-13, 12), P(13, 12)], fill=col, width=W_)
    elif kind == "check":
        d.ellipse([*P(-11, -11), *P(11, 11)], outline=col, width=W_)
        d.line([P(-5, 0), P(-1, 5), P(6, -5)], fill=col, width=W_, joint="curve")
    elif kind == "sheet":
        d.rounded_rectangle([*P(-9, -12), *P(9, 12)], radius=2 * k * SS, outline=col, width=W_)
        for y in (-5, 0, 5):
            d.line([P(-5, y), P(5, y)], fill=col, width=W_)


# ---------------------------------------------------------------- window chrome
@functools.lru_cache(maxsize=1)
def window_frame():
    w, h = 1620, 790
    cv = Canvas(w, h)
    cv.rrect(0, 0, w, h, 22, fill=c255(PANEL, 0.96), outline=c255(GRAY, 0.22), width=1)
    # sidebar (right, RTL app)
    cv.rrect(w - 290, 0, w, h, 22, fill=c255(shade("charcoal", 0.92), 1.0))
    cv.d.rectangle([(w - 290) * SS, 0, (w - 270) * SS, h * SS], fill=c255(shade("charcoal", 0.92)))
    cv.line([(w - 290, 24), (w - 290, h - 24)], c255(GRAY, 0.18), 1)
    # top bar
    cv.line([(30, 96), (w - 320, 96)], c255(GRAY, 0.16), 1)
    cv.text(w - 320, h - 26, "واجهة توضيحية · بيانات وأرقام افتراضية", "ar_regular", 18, c255(GRAY, 0.75))
    cv.text(36, h - 26, "CONCEPT INTERFACE · ILLUSTRATIVE DATA", "lat_regular", 13, c255(GRAY, 0.6), anchor="ls",
            track=0.25)
    return cv.sprite()


NAV = [("المواد", "layers"), ("الطلبات", "sheet"), ("النقل", "truck"), ("المتابعة", "check")]


@functools.lru_cache(maxsize=6)
def sidebar_nav(active):
    w, h = 290, 420
    cv = Canvas(w, h)
    for i, (lab, ic) in enumerate(NAV):
        y = 30 + i * 74
        on = i == active
        if on:
            cv.rrect(18, y - 26, w - 18, y + 30, 12, fill=c255(CU, 0.16), outline=c255(CU, 0.55), width=1)
        col = CU if on else GRAY
        icon(cv, ic, w - 54, y + 2, 26, col, 2)
        cv.text(w - 86, y + 13, lab, "ar_regular", 26, c255(OFF if on else GRAY, 1.0 if on else 0.85))
    return cv.sprite()


STEPS = [("عرض المادة", "LIST"), ("طلب الشراء", "REQUEST"), ("عروض النقل", "TRANSPORT"), ("التسليم", "DELIVERY")]


@functools.lru_cache(maxsize=8)
def stepper(active):
    """Horizontal RTL stepper; returns sprite 1260x80. Step 1 at right."""
    w, h = 1260, 84
    cv = Canvas(w, h)
    xs = [w - 120 - i * 340 for i in range(4)]
    for i, (ar, en) in enumerate(STEPS):
        x = xs[i]
        done, on = i < active, i == active
        col = CU if (on or done) else GRAY
        cv.circle(x + 70, 30, 20, fill=c255(CU, 1.0) if on else c255(CU, 0.22) if done else None,
                  outline=c255(col, 0.9), width=2)
        cv.text(x + 70, 38, str(i + 1), "lat_medium", 20, c255(shade("charcoal", 0.9) if on else col), anchor="ms")
        cv.text(x + 36, 40, ar, "ar_bold" if on else "ar_regular", 28, c255(OFF if on else GRAY, 1 if on else 0.8))
        cv.text(x + 36, 74, en, "lat_regular", 14, c255(col, 0.85), anchor="rs", track=0.22)
    return cv.sprite()


def stepper_x(i):
    return 1260 - 120 - i * 340 + 70


# ---------------------------------------------------------------- generic pieces
@functools.lru_cache(maxsize=128)
def label(s, key, size, color, alpha=1.0, anchor_right=True):
    from lib import text
    return text(s, key, size, color)


@functools.lru_cache(maxsize=64)
def field(lbl, value, sub=None, w=760, h=70):
    cv = Canvas(w, h + 46)
    cv.text(w - 4, 30, lbl, "ar_regular", 24, c255(GRAY))
    cv.rrect(2, 42, w - 2, 42 + h, 12, fill=c255(PANEL2, 0.85), outline=c255(GRAY, 0.25), width=1)
    cv.text(w - 26, 42 + h / 2 + 11, value, "ar_regular", 30, c255(OFF))
    if sub:
        cv.text(24, 42 + h / 2 + 8, sub, "lat_light", 19, c255(GRAY), anchor="ls")
    return cv.sprite()


@functools.lru_cache(maxsize=32)
def chip(s, kind, w=210, h=46):
    cv = Canvas(w, h)
    if kind == "verified":
        cv.rrect(1, 1, w - 1, h - 1, h // 2, fill=c255(CU, 0.95))
        col = shade("charcoal", 0.8)
        cv.circle(w - 26, h / 2, 9, fill=c255(col))
        cv.line([(w - 31, h / 2), (w - 27, h / 2 + 4), (w - 21, h / 2 - 4)], c255(CU), 2)
        cv.text(w - 44, h / 2 + 9, s, "ar_bold", 23, c255(col))
    elif kind == "estimate":
        cv.rrect(1, 1, w - 1, h - 1, h // 2, fill=c255(GRAY, 0.16), outline=c255(GRAY, 0.9), width=2)
        cv.text(w - 26, h / 2 + 9, "≈", "lat_medium", 24, c255(SAND), anchor="ms")
        cv.text(w - 44, h / 2 + 9, s, "ar_regular", 23, c255(SAND))
    else:  # missing
        cv.rrect(1, 1, w - 1, h - 1, h // 2, outline=c255(SAND, 0.9), width=2, dash=True)
        cv.circle(w - 26, h / 2, 10, outline=c255(SAND), width=2)
        cv.text(w - 26, h / 2 + 7, "!", "lat_medium", 18, c255(SAND), anchor="ms")
        cv.text(w - 44, h / 2 + 9, s, "ar_regular", 23, c255(SAND))
    return cv.sprite()


@functools.lru_cache(maxsize=16)
def card(w, h, fill_k=1.45, outline_a=0.25, outline=None):
    cv = Canvas(w, h)
    cv.rrect(1, 1, w - 1, h - 1, 16, fill=c255(shade("charcoal", fill_k), 0.95),
             outline=c255(outline or GRAY, outline_a), width=1 if outline is None else 2)
    return cv.sprite()


@functools.lru_cache(maxsize=16)
def button(s, w=240, h=58, primary=True):
    cv = Canvas(w, h)
    if primary:
        cv.rrect(1, 1, w - 1, h - 1, 12, fill=c255(CU))
        cv.text(w / 2, h / 2 + 10, s, "ar_bold", 26, c255(shade("charcoal", 0.8)), anchor="ms")
    else:
        cv.rrect(1, 1, w - 1, h - 1, 12, outline=c255(CU, 0.9), width=2)
        cv.text(w / 2, h / 2 + 10, s, "ar_regular", 26, c255(CU), anchor="ms")
    return cv.sprite()


@functools.lru_cache(maxsize=16)
def icon_badge(kind, r=34, color=None):
    cv = Canvas(2 * r + 4, 2 * r + 4)
    cv.circle(r + 2, r + 2, r, fill=c255(shade("charcoal", 1.7)), outline=c255(GRAY, 0.35), width=1)
    icon(cv, kind, r + 2, r + 2, r * 0.95, color or CU, 2)
    return cv.sprite()


def rock_thumb(w, h, radius=14):
    """Rounded rock sample image rendered from the terrain."""
    import cv2
    import terrain
    img, _ = terrain.render(1250, 1300, 1.35, 0.9, 0.55, (w * 0.55, h * 0.4), max(w, h) * 0.75,
                            exposure=1.25, out_w=w, out_h=h, copper_boost=1.3, ambient=0.08)
    img = np.clip(terrain.tonemap(img), 0, 1)
    pil = Image.fromarray((img * 255).astype(np.uint8)).convert("RGBA")
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius, fill=255)
    pil.putalpha(m)
    return pil
