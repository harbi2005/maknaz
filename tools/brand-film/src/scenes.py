"""The six scenes of the MAKNAZ film. Each scene: fn(f_local, f_global) -> float32 RGB frame."""
import functools
import math
import os

import cv2
import numpy as np

import terrain
import ui
from config import ASSETS, H, PAL, W, s as sec, shade
from lib import (Sprite, aa_circle, aa_line, aa_polyline, blit, blit_center, dashed, draw_alpha, ease, glow,
                 lin, mix, paint, partial_polyline, prog, show_text, smooth, solid, text, wipe_mask)

CU = np.array(PAL["copper"], np.float32)
CU_HI = np.array([1.0, 0.78, 0.58], np.float32)
OFF, SAND, GRAY = PAL["off"], PAL["sand"], PAL["gray"]
DARK = np.array(shade("charcoal", 0.52), np.float32)

# ===================================================================== logo assets
LOGO_K = 1.55          # lockup scale for hero moments (Scene 3 / 6)
SIDEBAR_K = 0.42


@functools.lru_cache(maxsize=None)
def logo_sprite(part, k):
    fname = {"icon": "logo_icon.png", "wordmark": "logo_wordmark_light.png"}[part]
    spr = Sprite.from_file(os.path.join(ASSETS, fname)).scaled(k)
    if k > 1.05:  # restore edge crispness after upscaling
        blur = cv2.GaussianBlur(spr.p, (0, 0), 1.1)
        p = np.clip(spr.p + 0.55 * (spr.p - blur), 0, None)
        p[..., :3] = np.minimum(p[..., :3], p[..., 3:4])
        spr = Sprite(p)
    return spr


def lockup_pos(cx, cy, k):
    """Centres of icon and wordmark for a lockup centred at (cx, cy) — layout as on the board."""
    iw, ww, gap = 185 * k, 205 * k, 26 * k
    total = iw + gap + ww
    return (cx - total / 2 + iw / 2, cy), (cx + total / 2 - ww / 2, cy + 2 * k)


def draw_lockup(frame, cx, cy, k, opacity=1.0):
    kq = round(k, 3)
    (ix, iy), (wx, wy) = lockup_pos(cx, cy, kq)
    blit_center(frame, logo_sprite("icon", kq), ix, iy, opacity)
    blit_center(frame, logo_sprite("wordmark", kq), wx, wy, opacity)


def strata_reveal(frame, spr, cx, cy, p, bands=9, travel=80):
    """Logo emerges as stacked mineral layers settling into place, bottom layer first."""
    x0, y0 = round(cx - spr.w / 2), round(cy - spr.h / 2)
    bh = math.ceil(spr.h / bands)
    for i in range(bands):
        j = bands - 1 - i
        e = ease((p - i * 0.055) / 0.5, "out")
        if e <= 0.001:
            continue
        a, b = j * bh, min(spr.h, (j + 1) * bh)
        dx = (1 - e) * (travel if i % 2 else -travel)
        blit(frame, Sprite(spr.p[a:b]), x0 + dx, y0 + a, min(1.0, e * 1.3))


@functools.lru_cache(maxsize=8)
def _diag(h, w):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return xx + yy * 0.55


def light_sweep(frame, spr, cx, cy, pos, width=26, strength=0.85):
    """Copper-white specular band travelling across the sprite's own surface (additive)."""
    d = _diag(spr.h, spr.w)
    m = np.exp(-((d - pos) ** 2) / (2 * width ** 2)) * spr.p[..., 3]
    add = np.dstack([m[..., None] * CU_HI * strength, m])
    blit(frame, Sprite(add), round(cx - spr.w / 2), round(cy - spr.h / 2), 1.0, mode="add")


# ===================================================================== shared visuals
@functools.lru_cache(maxsize=1)
def bg_gradient():
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    top, mid = np.array(shade("charcoal", 0.42)), np.array(shade("charcoal", 0.78))
    g = top + (mid - top) * np.exp(-((y - 0.62) ** 2) / 0.09)
    return np.broadcast_to(g, (H, W, 3)).astype(np.float32).copy()


@functools.lru_cache(maxsize=1)
def brand_pattern_alpha():
    """Board 'brand pattern': fine parallel diagonals with a few copper accents."""
    m = np.zeros((H, W), np.uint8)
    acc = np.zeros((H, W), np.uint8)
    for i, x in enumerate(range(-H, W + H, 64)):
        aa_line(m, (x, H), (x + H * 0.9, 0), 1)
        if i % 9 == 4:
            aa_line(acc, (x, H), (x + H * 0.9, 0), 2)
    return m.astype(np.float32) / 255, acc.astype(np.float32) / 255


def brand_pattern(frame, opacity, accent=0.0, drift=0.0):
    m, acc = brand_pattern_alpha()
    if drift:
        M = np.float32([[1, 0, drift % 64], [0, 1, 0]])
        m = cv2.warpAffine(m, M, (W, H))
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    fade = (0.35 + 0.65 * np.sin(yy * np.pi)) * opacity
    paint(frame, m * fade, GRAY, 0.6)
    if accent:
        paint(frame, acc * fade, CU, accent)


def scrim(frame, cx, cy, rx, ry, k=0.55):
    yy, xx = np.ogrid[0:H, 0:W]
    m = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)).astype(np.float32)
    frame *= (1 - k * m)[..., None]


def terrain_frame(cx, cy, zoom, az, el, pool, pool_r, exposure, boost=1.0):
    img, spec = terrain.render(cx, cy, zoom, az, el, pool, pool_r, exposure, copper_boost=boost)
    out = terrain.tonemap(img)
    glow(out, (spec[..., None] * CU_HI * 0.5 * exposure).astype(np.float32), sigma=22, k=0.5)
    return out


# ===================================================================== SCENE 1 — the overlooked resource
HORIZON = 700          # world horizon (scene 2 layout)
SCREEN_HZ = 780        # where the horizon / copper stratum sits on screen


def scene1(f, g):
    n = sec(7)
    cam = ease(f / n, "inout")
    expo = ease(f / 70, "soft") * (1 - 0.82 * prog(f, 178, 32, "inout"))
    frame = terrain_frame(mix(2350, 1650, cam), mix(1150, 1020, cam), mix(1.22, 1.42, cam),
                          az=mix(2.6, 1.2, cam), el=mix(0.22, 0.34, cam),
                          pool=(mix(1450, 760, cam), mix(470, 560, cam)), pool_r=mix(470, 640, cam),
                          exposure=expo * 1.15, boost=1.1)
    # statement
    t = text("ليست كل قيمةٍ ظاهرة.", "ar_light", 70, OFF)
    if f > 60:
        scrim(frame, 960, 540, 620, 170, 0.45 * prog(f, 66, 30) * (1 - prog(f, 168, 20)))
    show_text(frame, t, 960, 532, f, 74, 160, dur=34, rise=14)
    # transition: a copper stratum ignites across frame (RTL) — becomes Scene 2's ground line
    if f >= 168:
        p = prog(f, 168, 36, "inout")
        a = draw_alpha(lambda m: aa_line(m, (W * (1 - p), SCREEN_HZ), (W + 4, SCREEN_HZ), 2))
        paint(frame, a, CU, 0.95)
        hx = W * (1 - p)
        hot = draw_alpha(lambda m: aa_circle(m, (hx, SCREEN_HZ), 3))
        paint(frame, hot, CU_HI, 1.0, "add")
        glow(frame, (a[..., None] * CU * 0.9 + hot[..., None] * CU_HI * 3), sigma=14, k=0.9)
    return frame


# ===================================================================== SCENE 2 — the industrial gap
def _ridge(seed, base, amp, step=8):
    rng = np.random.default_rng(seed)
    xs = np.arange(-200, W + 260, step)
    n = np.cumsum(rng.standard_normal(len(xs))) * 0.6
    n = cv2.GaussianBlur(n.reshape(1, -1).astype(np.float32), (0, 0), 9).ravel()
    n = (n - n.min()) / (np.ptp(n) + 1e-6)
    return [(x, base - amp * v) for x, v in zip(xs, n)]


@functools.lru_cache(maxsize=1)
def s2_layers():
    """Pre-drawn silhouettes (alpha masks)."""
    def mk(fn):
        m = np.zeros((H, W), np.uint8)
        fn(m)
        return m.astype(np.float32) / 255

    far = _ridge(3, HORIZON - 40, 150)
    mid = _ridge(9, HORIZON - 10, 90)

    def poly_fill(pts):
        def fn(m):
            from lib import aa_poly_fill
            aa_poly_fill(m, pts + [(W + 260, H), (-200, H)])
        return fn

    far_a = mk(poly_fill(far))
    mid_a = mk(poly_fill(mid))

    def plant(m):
        from lib import aa_poly_fill
        R = lambda x0, y0, x1, y1: aa_poly_fill(m, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
        R(250, 560, 560, HORIZON)          # processing hall
        aa_poly_fill(m, [(250, 560), (405, 505), (560, 560)])
        R(590, 470, 640, HORIZON)          # silo pair
        R(652, 450, 702, HORIZON)
        aa_poly_fill(m, [(590, 470), (615, 452), (640, 470)])
        aa_poly_fill(m, [(652, 450), (677, 432), (702, 450)])
        R(300, 400, 322, 560)              # stack
        R(720, 600, 820, HORIZON)          # transfer house
        # headframe tower
        for a, b in [((470, 380), (440, 560)), ((470, 380), (500, 560)), ((452, 470), (488, 470)),
                     ((446, 520), (494, 520)), ((470, 380), (470, 360))]:
            aa_line(m, a, b, 5)
        # conveyor truss to stockpile head
        aa_line(m, (800, 610), (1000, 362), 7)
        aa_line(m, (806, 626), (1006, 378), 3)
        for k in range(1, 9):
            t = k / 9
            x, y = 800 + 200 * t, 610 - 248 * t
            aa_line(m, (x, y), (x + 6, y + 16), 2)
            aa_line(m, (x, y), (x - 10, HORIZON) if k % 3 == 0 else (x, y), 2)
        R(992, 356, 1018, 376)

    plant_a = mk(plant)
    cone = [(860, HORIZON), (1012, 474), (1036, 470), (1200, HORIZON)]
    cone_a = mk(lambda m: __import__("lib").aa_poly_fill(m, cone))
    # cone material: terrain texture lit from the left
    img, _ = terrain.render(2400, 900, 1.0, 2.6, 0.45, (1000, 560), 240, 1.35, copper_boost=1.8, ambient=0.05)
    tex = terrain.tonemap(img)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    shade_lr = (np.clip(1.0 - (xx - 1000) / 380, 0.3, 1.0) * np.clip(0.55 + (yy - 470) / 500, 0.5, 1.0))[..., None]
    tex = tex * shade_lr
    return far_a, mid_a, plant_a, cone_a, tex


def _buyer_icon_alpha(cx, cy, s):
    m = np.zeros((H, W), np.uint8)
    k = s / 24
    P = lambda x, y: (cx + x * k, cy + y * k)
    pts = [(-12, 10), (-12, -2), (-5, -6), (-5, -2), (2, -6), (2, -2), (9, -6), (9, -12), (12, -12), (12, 10),
           (-12, 10)]
    aa_polyline(m, [P(*p) for p in pts], 3)
    for x in (-8, -2, 4):
        aa_polyline(m, [P(x, 3), P(x + 3, 3), P(x + 3, 6), P(x, 6)], 2, closed=True)
    return m.astype(np.float32) / 255


@functools.lru_cache(maxsize=1)
def lift_particles():
    rng = np.random.default_rng(5)
    n = 230
    # start on the stockpile surface
    u = rng.uniform(0, 1, n)
    xs = mix(880, 1190, u)
    top = np.where(xs < 1020, mix(HORIZON, 474, (xs - 860) / 152), mix(470, HORIZON, (xs - 1036) / 164))
    ys = mix(top, HORIZON - 4, rng.uniform(0, 0.5, n) ** 2)
    return dict(x=xs, y=ys, vy=rng.uniform(2.5, 6.0, n), ph=rng.uniform(0, 6.28, n), sz=rng.uniform(1.2, 3.2, n),
                br=rng.uniform(0.5, 1.0, n), delay=rng.uniform(0, 26, n))


LIFT_START = sec(7) + 192  # global frame where by-product particles begin to rise


def lift_pos(tl):
    P = lift_particles()
    t = np.maximum(tl - P["delay"], 0)
    x = P["x"] + np.sin(P["ph"] + t * 0.05) * t * 0.9 + (P["x"] - 1030) * t * 0.012
    y = P["y"] - P["vy"] * 42 * (1 - np.exp(-t / 45)) - 0.5 * t
    return x, y


def cam2(f):
    """Scene 2 camera: world -> screen (slow push-in, horizon locked to SCREEN_HZ)."""
    e = ease(min(max(f, 0), 240) / 240, "inout")
    k, dx = mix(1.42, 1.52, e), mix(150, 80, e)
    return k, dx


def S(x, y, f):
    k, dx = cam2(f)
    return (np.asarray(x) - 960) * k + 960 + dx, (np.asarray(y) - HORIZON) * k + SCREEN_HZ


def draw_particles(frame, xs, ys, sizes, bright, opacity=1.0, bloom=0.8):
    m = np.zeros((H, W), np.float32)
    for x, y, r, b in zip(xs, ys, sizes, bright):
        if -10 < x < W + 10 and -10 < y < H + 10:
            cv2.circle(m, (int(x * 16), int(y * 16)), int(r * 16), float(b), -1, cv2.LINE_AA, 4)
    paint(frame, np.clip(m, 0, 1), CU_HI * 0.9, opacity, "add")
    glow(frame, m[..., None] * CU * opacity, sigma=10, k=bloom)


def scene2(f, g):
    far_a, mid_a, plant_a, cone_a, tex = s2_layers()
    frame = bg_gradient().copy()
    # ground below horizon
    frame[HORIZON:] *= 0.55
    rise = lambda t0, d=40: ease((f - t0) / d, "out")
    clipm = np.ones((H, 1), np.float32)
    clipm[HORIZON + 1:] = 0
    par = f * 0.15
    for alpha, col, t0, k, op in [(far_a, shade("charcoal", 0.95), 2, 0.2, 0.9), (mid_a, shade("charcoal", 0.7), 8, 0.4, 1.0)]:
        e = rise(t0, 46)
        if e > 0:
            M = np.float32([[1, 0, -par * k], [0, 1, (1 - e) * 160]])
            a = cv2.warpAffine(alpha, M, (W, H)) * clipm
            paint(frame, a, col, op * min(1, e * 1.5))
    # haze band at horizon
    yy = np.arange(H, dtype=np.float32)[:, None, None]
    frame += np.exp(-((yy - HORIZON + 30) ** 2) / 2600) * np.array(GRAY, np.float32) * 0.05
    e = rise(14, 44)
    if e > 0:
        M = np.float32([[1, 0, -par * 0.7], [0, 1, (1 - e) * 260]])
        a = cv2.warpAffine(plant_a, M, (W, H)) * clipm
        paint(frame, a, shade("charcoal", 0.42), 1.0)
        # rim light on structures from the horizon
        rim = np.clip(a - cv2.warpAffine(a, np.float32([[1, 0, 0], [0, 1, 2]]), (W, H)), 0, 1)
        paint(frame, rim, GRAY, 0.35 * e)
    e = rise(22, 44)
    if e > 0:
        M = np.float32([[1, 0, -par * 0.7], [0, 1, (1 - e) * 260]])
        a = cv2.warpAffine(cone_a, M, (W, H)) * clipm
        texm = cv2.warpAffine(tex, M, (W, H))
        frame[:] = frame * (1 - a[..., None]) + texm * a[..., None] * (1 - 0.6 * prog(f, 190, 40))
    # material falling from the conveyor head
    if 40 < f < 200:
        rng = np.random.default_rng(1)
        k = np.arange(120)
        t = (f - 40 + k * 1.37) % 26
        xs = 1004 + rng.uniform(-6, 6, 120) + t * 0.9
        ys = 380 + 0.16 * t ** 2
        ok = ys < 476
        op = min(1, (f - 40) / 15) * (1 - prog(f, 180, 20))
        draw_particles(frame, xs[ok], ys[ok], np.full(ok.sum(), 1.6), np.full(ok.sum(), 0.7), op, 0.4)
    # camera
    k, dx = cam2(f)
    M = np.float32([[k, 0, 960 - 960 * k + dx], [0, k, SCREEN_HZ - HORIZON * k]])
    frame = cv2.warpAffine(frame, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    # ground line (from Scene 1) cools to mineral gray
    gl = draw_alpha(lambda m: aa_line(m, (0, SCREEN_HZ), (W, SCREEN_HZ), 2))
    paint(frame, gl, CU * (1 - prog(f, 0, 40)) + np.array(GRAY) * prog(f, 0, 40), 0.9)
    # annotation: by-product
    ann_p = prog(f, 64, 26)
    if ann_p > 0:
        ax, ay = S(1110, 575, f)
        pts = [(ax, ay), (ax + 60, 470), (ax + 150, 470)]
        part, end = partial_polyline(pts, ann_p)
        a = draw_alpha(lambda m: (aa_polyline(m, part, 2), aa_circle(m, pts[0], 5)))
        paint(frame, a, SAND, 0.85)
        lab = text("مخلفات ومواد ثانوية متاحة", "ar_regular", 34, OFF)
        lab2 = text("AVAILABLE MINING BY-PRODUCTS", "lat_regular", 15, GRAY, track=0.24)
        show_text(frame, lab, ax + 162 + lab.w / 2, 452, f, 80, 214, dur=24, rise=8, direction="rtl")
        show_text(frame, lab2, ax + 162 + lab2.w / 2, 496, f, 88, 214, dur=24, rise=8)
    # potential buyer — far right, disconnected
    bp = prog(f, 92, 26)
    if bp > 0:
        a = _buyer_icon_alpha(1730, 696, 120)
        paint(frame, a, SAND, 0.9 * bp * (1 - prog(f, 214, 20)))
        lab = text("مصنع يبحث عن مواد مناسبة", "ar_regular", 30, OFF)
        lab2 = text("FACTORY · POTENTIAL BUYER", "lat_regular", 15, GRAY, track=0.24)
        show_text(frame, lab, 1690, 838, f, 100, 214, dur=24, rise=8)
        show_text(frame, lab2, 1690, 880, f, 106, 214, dur=24, rise=8)
    # the missing link: no clear route or carrier between the stockpile and the factory
    cp = prog(f, 118, 40, "inout")
    if cp > 0:
        fade = 1 - prog(f, 214, 20)
        a = draw_alpha(lambda m: dashed(m, (1400, 740), (1650, 740), 12, 10, 2, upto=cp))
        paint(frame, a, GRAY, 0.75 * fade)
        qp = prog(f, 146, 22)
        if qp > 0:
            truck = ui.icon_badge("truck", 30, ui.GRAY)
            blit_center(frame, truck, 1525, 740, qp * fade)
            ring = draw_alpha(lambda m: aa_circle(m, (1566, 700), 15, 2))
            paint(frame, ring, SAND, 0.85 * qp * fade)
            q = text("؟", "ar_regular", 22, SAND)
            blit_center(frame, q, 1566, 699, qp * fade)
            lab = text("نقل غير مرتّب", "ar_regular", 24, SAND)
            show_text(frame, lab, 1525, 645, f, 150, 214, dur=22, rise=6)
    # headline
    t = text("مواد متاحة… والطريق إليها غير واضح.", "ar_light", 62, OFF)
    show_text(frame, t, 960, 150, f, 112, 212, dur=32, rise=14)
    # by-product lifts off into darkness → Scene 3
    tl = g - LIFT_START
    if tl > 0:
        x, y = S(*lift_pos(tl), f)
        P = lift_particles()
        draw_particles(frame, x, y, P["sz"], P["br"], min(1, tl / 10), 0.9)
    # darken toward Scene 3
    frame *= 1 - 0.7 * prog(f, 200, 40, "inout")
    return frame


# ===================================================================== SCENE 3 — discovery & brand reveal
LOCK_CX, LOCK_CY = 960, 468


@functools.lru_cache(maxsize=1)
def logo_targets():
    spr = logo_sprite("icon", LOGO_K)
    a = (spr.p[..., 3] * 255).astype(np.uint8)
    edges = cv2.Canny(a, 60, 160)
    ys, xs = np.nonzero(edges)
    rng = np.random.default_rng(2)
    idx = rng.choice(len(xs), len(lift_particles()["x"]), replace=False)
    (ix, iy), _ = lockup_pos(LOCK_CX, LOCK_CY, LOGO_K)
    return xs[idx] + ix - spr.w / 2, ys[idx] + iy - spr.h / 2


def scene3(f, g):
    frame = solid(DARK) + bg_gradient() * 0.35
    brand_pattern(frame, 0.10 * prog(f, 10, 60) * (1 - 0.5 * prog(f, 120, 60)), accent=0.25 * prog(f, 30, 60),
                  drift=f * 0.4)
    P = lift_particles()
    tx, ty = logo_targets()
    tl = g - LIFT_START
    lx, ly = S(*lift_pos(tl), 240)
    # staggered convergence onto the symbol's contours
    st = 34 + (np.arange(len(tx)) % 23) * 1.6
    e = np.array([ease((f - s0) / 64, "inout") for s0 in st])
    x, y = mix(lx, tx, e), mix(ly, ty, e)
    # connective network while particles are in flight
    net = smooth((f - 8) / 26) * (1 - smooth((f - 70) / 30))
    if net > 0.01:
        idx = np.arange(0, len(x), 3)
        m = np.zeros((H, W), np.uint8)
        pts = np.stack([x[idx], y[idx]], 1)
        for i in range(len(pts)):
            d = np.hypot(*(pts - pts[i]).T)
            for j in np.argsort(d)[1:3]:
                if d[j] < 170 and j > i:
                    aa_line(m, pts[i], pts[j], 1)
        paint(frame, m.astype(np.float32) / 255, SAND, 0.28 * net)
    pop = 1 - smooth((f - 108) / 26)
    if pop > 0:
        draw_particles(frame, x, y, P["sz"] * (1 + 0.3 * e), P["br"], pop, 0.9)
    # brand reveal: icon as settling mineral layers, light sweep, then wordmark
    icon = logo_sprite("icon", LOGO_K)
    word = logo_sprite("wordmark", LOGO_K)
    (ix, iy), (wx, wy) = lockup_pos(LOCK_CX, LOCK_CY, LOGO_K)
    rp = lin(f, 92, 46)
    if rp > 0:
        strata_reveal(frame, icon, ix, iy, rp)
    if 128 <= f <= 170:
        light_sweep(frame, icon, ix, iy, mix(-120, icon.w + icon.h * 0.55 + 120, prog(f, 128, 40, "inout")))
    wp = prog(f, 132, 40, "soft")
    if wp > 0:
        m = wipe_mask(word.w, word.h, wp, "rtl", soft=90)
        blit(frame, word, round(wx - word.w / 2), round(wy - word.h / 2) + (1 - wp) * 8, min(1, wp * 1.4), m)
    # copper hairline + idea
    lp = prog(f, 160, 30, "inout")
    if lp > 0:
        a = draw_alpha(lambda m: aa_line(m, (960 - 70 * lp, 655), (960 + 70 * lp, 655), 2))
        paint(frame, a, CU, 0.9)
    t = text("منصة واحدة تربط المنجم والمصنع والناقل.", "ar_regular", 50, SAND)
    show_text(frame, t, 960, 728, f, 166, 226, dur=28, rise=12)
    return frame


# ===================================================================== SCENE 4 — how it works (concept UI)
# One marketplace, three parties: the mine lists, the factory requests, carriers bid, the deal is tracked.
# All values are illustrative (labelled on the window footer); no AI, no automated analysis.
WIN_X, WIN_Y = 150, 128
STEP_T = [30, 140, 262, 380]
S4_EXIT = 470
CAPTIONS = [
    "المنجم يعرض المخلفات المتاحة بكمياتها ومواصفاتها وسعرها وموقعها.",
    "المصنع يقدّم طلب شراء، والمنجم يقبل أو يرفض أو يقدّم عرضًا مقابلًا.",
    "شركات النقل المؤهلة تقدّم عروضها، والمصنع يقارن التكلفة الكاملة.",
    "متابعة التحميل والنقل والتسليم، مع حفظ مستندات الصفقة.",
]
ROLES = [("المنجم · البائع", "mine"), ("المصنع · المشتري", "industry"), ("شركات النقل", "truck"),
         ("جميع الأطراف", "check")]


def el(frame, spr, x, y, f, t0, dur=18, dy=12, wipe=None, fade_out=None):
    """Element entrance (rise + fade, optional reading-direction wipe) and optional exit."""
    if f < t0:
        return
    p = prog(f, t0, dur)
    o = min(1, p * 1.5)
    if fade_out is not None and f > fade_out:
        o *= 1 - prog(f, fade_out, 12, "in")
    if o <= 0:
        return
    m = wipe_mask(spr.w, spr.h, prog(f, t0, dur * 1.4, "soft"), wipe, soft=120) if (wipe and p < 1) else None
    blit(frame, spr, x, y + (1 - p) * dy, o, m)


@functools.lru_cache(maxsize=4)
def thumb(w, h):
    return Sprite.from_pil(ui.rock_thumb(w, h))


def right(spr, xr):
    return xr - spr.w


@functools.lru_cache(maxsize=8)
def role_tag(i):
    lab, ic = ROLES[i]
    f_ = ui.font("ar_regular", 24 * ui.SS)
    tw = f_.getlength(lab, direction="rtl", language="ar") / ui.SS
    w, h = int(tw + 76), 44
    cv = ui.Canvas(w, h)
    cv.rrect(1, 1, w - 1, h - 1, h // 2, fill=ui.c255(ui.CU, 0.14), outline=ui.c255(ui.CU, 0.7), width=1)
    ui.icon(cv, ic, w - 26, h / 2, 22, ui.CU, 2)
    cv.text(w - 46, h / 2 + 9, lab, "ar_regular", 24, ui.c255(ui.OFF))
    return cv.sprite()


def header(frame, f, t, out, i, title):
    tag = role_tag(i)
    el(frame, tag, right(tag, 1440), 250, f, t, fade_out=out)
    T = text(title, "ar_bold", 40, OFF)
    el(frame, T, right(T, 1440 - tag.w - 24), 244, f, t + 3, fade_out=out)


def row_text(frame, f, t0, out, y, label, value, x_r, x_l, vcol=OFF, lsize=24, vsize=26, bold=False):
    l_ = text(label, "ar_regular", lsize, GRAY)
    el(frame, l_, right(l_, x_r), y, f, t0, fade_out=out)
    v_ = text(value, "ar_bold" if bold else "ar_regular", vsize, vcol)
    el(frame, v_, x_l, y - (vsize - lsize) / 2 - 2, f, t0 + 3, fade_out=out)


# ---- step 1: the mine lists a by-product
def step_list(frame, f, t, out):
    header(frame, f, t, out, 0, "عرض مادة جديدة")
    el(frame, thumb(420, 300), 200, 330, f, t + 4, fade_out=out)
    cap = text("صورة المادة", "ar_regular", 22, GRAY)
    el(frame, cap, right(cap, 620), 642, f, t + 10, fade_out=out)
    rows = [("نوع المادة", "خبث نحاس", "Copper slag"),
            ("الكمية المتاحة", "2,000 طن", "Quantity"),
            ("سعر الوحدة", "45 ر.س / طن · قابل للتفاوض", "Unit price"),
            ("الموقع والجاهزية", "موقع المنجم · جاهز للتحميل", "Location"),
            ("التحاليل", "تقرير مختبري مرفق", "Lab report · PDF")]
    for i, (l, v, sub) in enumerate(rows):
        el(frame, ui.field(l, v, sub, 740, 56), 700, 316 + i * 104, f, t + 8 + i * 8, dur=22, wipe="rtl",
           fade_out=out)
    b = ui.button("نشر العرض", 250, 60)
    if f >= t + 56:
        pulse = math.exp(-((f - (t + 84)) / 5) ** 2) if f > t + 76 else 0
        el(frame, b, 200, 790 - pulse * 3, f, t + 56, fade_out=out)
        if pulse > 0.02:
            ring = draw_alpha(lambda m: cv2.rectangle(m, (196 * 16, 786 * 16), (454 * 16, 854 * 16), 255, 2,
                                                       cv2.LINE_AA, 4))
            paint(frame, ring, CU_HI, pulse * 0.8)


# ---- step 2: the factory requests, the mine responds (preliminary acceptance ≠ confirmed order)
def step_request(frame, f, t, out):
    header(frame, f, t, out, 1, "طلب شراء")
    rows = [("المادة", "خبث نحاس — منجم (أ)", None),
            ("الكمية المطلوبة", "600 طن", "Quantity"),
            ("السعر المعروض", "45 ر.س / طن", "Listed"),
            ("السعر المقترح", "40 ر.س / طن", "Proposed"),
            ("موقع التسليم", "مصنع إسمنت — المنطقة (ب)", "Delivery")]
    for i, (l, v, sub) in enumerate(rows):
        el(frame, ui.field(l, v, sub, 740, 56), 700, 316 + i * 104, f, t + 6 + i * 7, dur=22, wipe="rtl",
           fade_out=out)
    fo = 1 - prog(f, out, 12, "in") if f > out else 1
    # proposed price highlight
    if f >= t + 40:
        hl = prog(f, t + 40, 16) * fo
        a = draw_alpha(lambda m: cv2.rectangle(m, (698 * 16, 666 * 16), (1442 * 16, 726 * 16), 255, 2,
                                               cv2.LINE_AA, 4))
        paint(frame, a, CU, 0.8 * hl)
    # the mine's response card
    el(frame, ui.card(440, 520), 200, 316, f, t + 30, fade_out=out)
    rt = text("رد المنجم", "ar_bold", 30, OFF)
    el(frame, rt, right(rt, 610), 340, f, t + 34, fade_out=out)
    btns = [("قبول", 520, 100), ("رفض", 405, 100), ("عرض مقابل", 220, 172)]
    sel = f >= t + 58
    for j, (s_, x, bw) in enumerate(btns):
        el(frame, ui.button(s_, bw, 50, sel and j == 2), x, 404, f, t + 38 + j * 3, fade_out=out)
    co = text("عرض مقابل: 42 ر.س / طن", "ar_bold", 28, ui.CU)
    el(frame, co, right(co, 610), 490, f, t + 62, wipe="rtl", fade_out=out)
    agree = text("قبول المصنع للعرض المقابل", "ar_regular", 22, GRAY)
    el(frame, agree, right(agree, 610), 540, f, t + 72, fade_out=out)
    el(frame, ui.chip("قبول مبدئي · الكمية محجوزة", "verified", 400, 50), 220, 610, f, t + 80, fade_out=out)
    w1 = text("نافذة التحميل: 7 أيام", "ar_regular", 24, OFF)
    el(frame, w1, right(w1, 610), 690, f, t + 86, fade_out=out)
    w2 = text("بانتظار تأمين النقل لتأكيد الطلب", "ar_regular", 22, SAND)
    el(frame, w2, right(w2, 610), 740, f, t + 90, fade_out=out)


# ---- step 3: qualified carriers bid; the factory compares the full landed cost
def step_transport(frame, f, t, out):
    header(frame, f, t, out, 2, "عروض النقل")
    fo = 1 - prog(f, out, 12, "in") if f > out else 1
    offers = [("ناقل (أ)", "18 رحلة · 3 أيام · يشمل التحميل", "21,600 ر.س", True),
              ("ناقل (ب)", "18 رحلة · 5 أيام · لا يشمل التحميل", "19,800 ر.س", False),
              ("ناقل (ج)", "18 رحلة · يومان · يشمل التحميل", "23,400 ر.س", False)]
    picked = f >= t + 66
    for i, (name, sub_, price, best) in enumerate(offers):
        y = 322 + i * 132
        t0 = t + 8 + i * 9
        hi = best and picked
        el(frame, ui.card(780, 112, 1.45, 0.9 if hi else 0.25, ui.CU if hi else None), 660, y, f, t0, fade_out=out)
        el(frame, ui.icon_badge("truck", 30, ui.CU if hi else ui.GRAY), 1440 - 28 - 64, y + 24, f, t0 + 2,
           fade_out=out)
        n_ = text(name, "ar_bold", 30, OFF)
        el(frame, n_, right(n_, 1440 - 110), y + 14, f, t0 + 3, fade_out=out)
        s_ = text(sub_, "ar_regular", 22, GRAY)
        el(frame, s_, right(s_, 1440 - 110), y + 62, f, t0 + 5, fade_out=out)
        p_ = text(price, "ar_bold", 30, ui.CU if hi else OFF)
        el(frame, p_, 690, y + (14 if (best and picked) else 34), f, t0 + 6, fade_out=out)
    if picked:
        el(frame, ui.chip("تم الاختيار", "verified", 170, 40), 690, 322 + 66, f, t + 66, dur=12, dy=0, fade_out=out)
    # landed-cost summary
    el(frame, ui.card(420, 494), 200, 322, f, t + 24, fade_out=out)
    ct = text("التكلفة الكاملة للوصول", "ar_bold", 28, OFF)
    el(frame, ct, right(ct, 596), 344, f, t + 28, fade_out=out)
    lines = [("قيمة المادة", "25,200 ر.س"), ("النقل — ناقل (أ)", "21,600 ر.س"), ("التحميل والتفريغ", "مشمول")]
    for i, (l, v) in enumerate(lines):
        row_text(frame, f, t + 34 + i * 8, out, 410 + i * 66, l, v, 596, 226, OFF, 22, 24)
    sub_q = text("600 طن بسعر 42 ر.س للطن", "ar_regular", 18, GRAY)
    el(frame, sub_q, right(sub_q, 596), 440, f, t + 38, fade_out=out)
    tot_t = t + 70
    if f >= tot_t:
        ln = draw_alpha(lambda m: aa_line(m, (226, 612), (596, 612), 1))
        paint(frame, ln, GRAY, 0.4 * fo * prog(f, tot_t, 10))
    row_text(frame, f, tot_t, out, 636, "الإجمالي", "46,800 ر.س", 596, 226, ui.CU, 26, 32, bold=True)
    nt = text("وفق البنود المتفق عليها", "ar_regular", 20, GRAY)
    el(frame, nt, right(nt, 596), 690, f, tot_t + 4, fade_out=out)
    el(frame, ui.button("تأكيد الطلب", 380, 56), 220, 744, f, tot_t + 10, fade_out=out)


# ---- step 4: execution & delivery tracking, documents kept
MILESTONES = ["تأكيد الطلب", "التحميل", "في الطريق", "التسليم", "تأكيد الاستلام"]


def step_track(frame, f, t, out):
    header(frame, f, t, out, 3, "متابعة الشحنة")
    xs = [1360 - i * 270 for i in range(5)]
    y = 470
    reached = 2 + prog(f, t + 40, 40, "inout") * 2  # progresses to "delivered"
    fo = 1 - prog(f, out, 12, "in") if f > out else 1
    lp = prog(f, t + 6, 30, "inout")
    if lp > 0:
        base = draw_alpha(lambda m: aa_line(m, (xs[0], y), (mix(xs[0], xs[-1], lp), y), 2))
        paint(frame, base, GRAY, 0.35 * fo)
        cur = mix(xs[0], xs[0] - 270 * reached, lp)
        done = draw_alpha(lambda m: aa_line(m, (xs[0], y), (cur, y), 3))
        paint(frame, done, CU, 0.95 * fo)
        hot = draw_alpha(lambda m: aa_circle(m, (cur, y), 6))
        paint(frame, hot, CU_HI, fo, "add")
        glow(frame, hot[..., None] * CU_HI * 2.5, 10, 0.8 * fo)
    for i, (x, lab) in enumerate(zip(xs, MILESTONES)):
        t0 = t + 8 + i * 5
        if f < t0:
            continue
        ap = prog(f, t0, 16) * fo
        on = reached >= i - 0.02
        disc = draw_alpha(lambda m: aa_circle(m, (x, y), 18))
        paint(frame, disc, shade("charcoal", 1.5), ap)
        ring = draw_alpha(lambda m: aa_circle(m, (x, y), 18, 2))
        paint(frame, ring, CU if on else GRAY, ap)
        if on:
            dot = draw_alpha(lambda m: aa_circle(m, (x, y), 8))
            paint(frame, dot, CU, ap)
        l_ = text(lab, "ar_bold" if on else "ar_regular", 26, OFF if on else GRAY)
        el(frame, l_, x - l_.w / 2, y + 40, f, t0 + 2, fade_out=out)
    # truck glyph riding the progress line
    if lp > 0:
        tx = mix(xs[0], xs[0] - 270 * reached, lp)
        el(frame, ui.icon_badge("truck", 28), tx - 30, y - 104, f, t + 10, dur=12, dy=0, fade_out=out)
    # documents
    dt = text("مستندات الصفقة", "ar_regular", 24, GRAY)
    el(frame, dt, right(dt, 1440), 640, f, t + 30, fade_out=out)
    docs = ["تأكيد الطلب", "عرض النقل المعتمد", "إثبات التحميل", "إثبات التسليم"]
    for i, d_ in enumerate(docs):
        x_r = 1440 - i * 312
        el(frame, doc_card(d_), x_r - 292, 690, f, t + 34 + i * 6, fade_out=out)


@functools.lru_cache(maxsize=8)
def doc_card(label):
    w, h = 292, 92
    cv = ui.Canvas(w, h)
    cv.rrect(1, 1, w - 1, h - 1, 14, fill=ui.c255(shade("charcoal", 1.45)), outline=ui.c255(ui.GRAY, 0.3), width=1)
    ui.icon(cv, "sheet", w - 36, h / 2, 30, ui.CU, 2)
    cv.text(w - 64, h / 2 + 10, label, "ar_regular", 24, ui.c255(ui.OFF))
    return cv.sprite()


STEP_FNS = [step_list, step_request, step_transport, step_track]


def scene4(f, g):
    frame = solid(DARK) + bg_gradient() * 0.4
    brand_pattern(frame, 0.05)
    wp = prog(f, 0, 30)
    exit_p = prog(f, S4_EXIT, 22, "inout")
    win = ui.window_frame()
    blit(frame, win, WIN_X, WIN_Y + (1 - wp) * 30, wp * (1 - exit_p))
    # logo travels from centre into the sidebar
    lp = prog(f, 0, 34, "inout")
    lx, ly = mix(LOCK_CX, WIN_X + 1620 - 145, lp), mix(LOCK_CY, WIN_Y + 92, lp)
    draw_lockup(frame, lx, ly, mix(LOGO_K, SIDEBAR_K, lp), 1 - exit_p)
    active = max(i for i, t0 in enumerate(STEP_T) if f >= t0) if f >= STEP_T[0] else 0
    if f >= 18:
        el(frame, ui.sidebar_nav(active), WIN_X + 1330, WIN_Y + 200, f, 18, fade_out=S4_EXIT)
        el(frame, ui.stepper(active), WIN_X + 40, WIN_Y + 6, f, 22, fade_out=S4_EXIT)
        x_r = WIN_X + 40 + ui.stepper_x(0)
        target = WIN_X + 40 + ui.stepper_x(active)
        prev = WIN_X + 40 + ui.stepper_x(max(active - 1, 0))
        cur = mix(prev, target, prog(f, STEP_T[active], 24, "inout")) if active else x_r
        if active:
            a = draw_alpha(lambda m: aa_line(m, (x_r + 24, WIN_Y + 96), (cur - 90, WIN_Y + 96), 2))
            paint(frame, a, CU, 0.7 * (1 - exit_p))
    for i, fn in enumerate(STEP_FNS):
        t0 = STEP_T[i]
        t1 = STEP_T[i + 1] if i < 3 else S4_EXIT
        if t0 <= f < t1 + 14:
            fn(frame, f, t0, t1 - 10)
    for i, c in enumerate(CAPTIONS):
        t0 = STEP_T[i] + 6
        t1 = (STEP_T[i + 1] - 8) if i < 3 else S4_EXIT - 4
        if t0 <= f < t1 + 20:
            show_text(frame, text(c, "ar_regular", 38, SAND), 960, 990, f, t0, t1, dur=26, rise=10)
    if exit_p > 0:
        frame = frame * (1 - exit_p) + solid(DARK) * exit_p
    return frame


# ===================================================================== SCENE 5 — one path, mine to factory
NODE_X = [1500, 1113, 727, 340]
NODE_Y = 450
NODE_R = 86
STAGES = [("مادة", "MATERIAL"), ("اتفاق", "AGREEMENT"), ("نقل", "TRANSPORT"), ("تسليم", "DELIVERY")]
ACT = [36, 80, 124, 168]
S5_EXIT = 252


@functools.lru_cache(maxsize=8)
def node_icon(i, active):
    kinds = [None, "sheet", "truck", "industry"]
    cv = ui.Canvas(2 * NODE_R + 8, 2 * NODE_R + 8)
    c = NODE_R + 4
    cv.circle(c, c, NODE_R - 2, fill=ui.c255(shade("charcoal", 1.35)))
    if kinds[i]:
        ui.icon(cv, kinds[i], c, c, 74, ui.CU if active else ui.GRAY, 3)
    return cv.sprite()


def rock_fragment(r, f):
    """Circular rock sample, lit by a slowly orbiting light."""
    d = int(2 * r)
    img, spec = terrain.render(1300, 1250, 1.6 * d / 300 + 0.2, 1.0 + f * 0.02, 0.5, (d * 0.45, d * 0.4), d * 0.8,
                               1.5, out_w=d, out_h=d, copper_boost=1.6, ambient=0.07)
    img = terrain.tonemap(img)
    yy, xx = np.mgrid[0:d, 0:d].astype(np.float32)
    a = np.clip(r - np.hypot(xx - r + 0.5, yy - r + 0.5), 0, 1)
    return Sprite(np.dstack([img * a[..., None], a]))


def scene5(f, g):
    frame = solid(DARK) + bg_gradient() * 0.3
    brand_pattern(frame, 0.07, accent=0.2, drift=-f * 0.3)
    exit_p = prog(f, S5_EXIT, 30, "inout")
    o = 1 - exit_p
    cam = 1 + 0.045 * ease(f / 285, "inout")
    rp = prog(f, 0, 40, "inout")
    rr = mix(34, NODE_R - 4, rp)
    rx, ry = NODE_X[0], NODE_Y
    # end labels: mine (start) and factory (end)
    for x, lab, en, t0 in [(NODE_X[0], "المنجم", "MINE", 30), (NODE_X[3], "المصنع", "FACTORY", ACT[3] + 4)]:
        l_ = text(lab, "ar_regular", 26, GRAY)
        show_text(frame, l_, x, NODE_Y - 140, f, t0, S5_EXIT, dur=22, rise=8, out_dur=30)
    for i in range(3):
        cp = prog(f, ACT[i] + 14, 34, "inout") * o
        if cp > 0:
            x0, x1 = NODE_X[i] - NODE_R - 12, NODE_X[i + 1] + NODE_R + 12
            xe = mix(x0, x1, cp)
            a = draw_alpha(lambda m: aa_line(m, (x0, NODE_Y), (xe, NODE_Y), 2))
            paint(frame, a, CU, 0.9)
            if cp < 1:
                hot = draw_alpha(lambda m: aa_circle(m, (xe, NODE_Y), 5))
                paint(frame, hot, CU_HI, 1.0, "add")
                glow(frame, hot[..., None] * CU_HI * 3, 10, 0.9)
            else:
                ah = draw_alpha(lambda m: aa_polyline(m, [(x1 + 12, NODE_Y - 8), (x1, NODE_Y), (x1 + 12, NODE_Y + 8)], 2))
                paint(frame, ah, CU, 0.9)
    for i, (ar, en) in enumerate(STAGES):
        ap = prog(f, ACT[i], 28)
        if ap <= 0:
            continue
        x = NODE_X[i]
        if i > 0:
            blit_center(frame, node_icon(i, True), x, NODE_Y, ap * o)
        ring = draw_alpha(lambda m: cv2.ellipse(m, (x * 16, NODE_Y * 16), (NODE_R * 16, NODE_R * 16), -90, 0,
                                                 360 * ap, 255, 2, cv2.LINE_AA, 4))
        paint(frame, ring, CU if i in (0, 3) else SAND, 0.9 * o)
        if i == 3:
            glow(frame, ring[..., None] * CU * prog(f, ACT[3] + 20, 30) * o, 30, 0.6)
        la = text(ar, "ar_bold", 48, OFF)
        show_text(frame, la, x, NODE_Y + 150, f, ACT[i] + 6, S5_EXIT, dur=24, rise=10, out_dur=30)
        le = text(en, "lat_regular", 17, GRAY, track=0.3)
        show_text(frame, le, x, NODE_Y + 205, f, ACT[i] + 12, S5_EXIT, dur=24, rise=8, out_dur=30)
    blit_center(frame, rock_fragment(rr, f), rx, ry, o * min(1, rp * 2.5))
    # a single shipment travels the whole path once it is complete
    tp = prog(f, ACT[3] + 14, 56, "inout")
    if 0 < tp < 1:
        px = mix(NODE_X[0] - NODE_R - 12, NODE_X[3] + NODE_R + 12, tp)
        dot = draw_alpha(lambda m: aa_circle(m, (px, NODE_Y), 7))
        paint(frame, dot, CU_HI, o * math.sin(tp * math.pi), "add")
        glow(frame, dot[..., None] * CU_HI * 3, 12, 0.9 * o)
    t = text("من موقع المنجم… إلى المصنع، في مسار واحد.", "ar_regular", 60, OFF)
    show_text(frame, t, 960, 850, f, 186, S5_EXIT, dur=34, rise=14, out_dur=26)
    if cam != 1:
        M = cv2.getRotationMatrix2D((960, 520), 0, cam)
        frame = cv2.warpAffine(frame, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return frame


# ===================================================================== SCENE 6 — brand finale
FIN_CY = 420


def scene6(f, g):
    cam = ease(f / 330, "inout")
    expo = 0.62 * prog(f, 0, 40, "soft")
    frame = terrain_frame(mix(1500, 1420, cam), mix(1500, 1440, cam), mix(1.55, 1.72, cam), az=mix(0.4, 1.3, cam),
                          el=0.3, pool=(960, 470), pool_r=mix(560, 760, cam), exposure=expo, boost=0.9)
    scrim(frame, 960, 520, 900, 380, 0.62)
    # strata lines converge on the mark
    sp = prog(f, 0, 80, "inout")
    so = (1 - prog(f, 70, 40)) * min(1, f / 12)
    if so > 0:
        rng = np.random.default_rng(4)
        m_g = np.zeros((H, W), np.uint8)
        m_c = np.zeros((H, W), np.uint8)
        for i in range(16):
            y = FIN_CY - 160 + i * 21 + rng.uniform(-4, 4)
            half = mix(rng.uniform(500, 900), rng.uniform(10, 120), sp)
            side = 1 if i % 2 else -1
            cx = 960 + side * (1 - sp) * rng.uniform(200, 700)
            aa_line(m_c if i % 5 == 2 else m_g, (cx - half, y), (cx + half, y), 2 if i % 5 == 2 else 1)
        paint(frame, m_g.astype(np.float32) / 255, GRAY, 0.45 * so)
        paint(frame, m_c.astype(np.float32) / 255, CU, 0.9 * so)
    icon = logo_sprite("icon", LOGO_K)
    word = logo_sprite("wordmark", LOGO_K)
    (ix, iy), (wx, wy) = lockup_pos(960, FIN_CY, LOGO_K)
    rp = lin(f, 52, 50)
    if rp > 0:
        strata_reveal(frame, icon, ix, iy, rp, bands=11, travel=60)
    if 96 <= f <= 146:
        sw = prog(f, 98, 46, "inout")
        light_sweep(frame, icon, ix, iy, mix(-140, icon.w + icon.h * 0.55 + 140, sw), 30, 1.0)
    wp = prog(f, 104, 42, "soft")
    if wp > 0:
        m = wipe_mask(word.w, word.h, wp, "rtl", soft=90)
        blit(frame, word, round(wx - word.w / 2), round(wy - word.h / 2) + (1 - wp) * 8, min(1, wp * 1.4), m)
    lp = prog(f, 150, 34, "inout")
    if lp > 0:
        a = draw_alpha(lambda m: aa_line(m, (960 - 60 * lp, 640), (960 + 60 * lp, 640), 2))
        paint(frame, a, CU, 0.95)
    tg = text("HIDDEN RESOURCES. NEW VALUE.", "lat_regular", 30, SAND, track=0.34)
    show_text(frame, tg, 960, 700, f, 160, dur=34, rise=10, direction="center")
    ar = text("من الموارد غير المستغلة، إلى فرص صناعية قابلة للتقييم.", "ar_regular", 40, OFF)
    show_text(frame, ar, 960, 782, f, 194, dur=34, rise=10)
    return frame


SCENE_FNS = {"s1_overlooked": scene1, "s2_gap": scene2, "s3_discovery": scene3, "s4_workflow": scene4,
             "s5_transform": scene5, "s6_finale": scene6}
