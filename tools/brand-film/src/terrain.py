"""Procedural macro mineral surface: stratified stone with copper veins, lit per frame.

Precomputes normals / albedo / specular / cavity maps once (cached), then each frame
crops a camera window and shades it with a moving raking light + light pool."""
import os

import cv2
import numpy as np

from config import CACHE, H, PAL, W

MW, MH = 3600, 2200


def _noise(shape, scale, rng):
    """Smooth value noise with feature size ~scale px (generated small, upscaled)."""
    sh = (max(4, int(shape[0] / scale) + 3), max(4, int(shape[1] / scale) + 3))
    n = rng.standard_normal(sh).astype(np.float32)
    n = cv2.resize(n, (shape[1] + int(3 * scale), shape[0] + int(3 * scale)), interpolation=cv2.INTER_CUBIC)
    n = n[int(scale):int(scale) + shape[0], int(scale):int(scale) + shape[1]]
    return (n - n.mean()) / (n.std() + 1e-6)


def fbm(shape, base, octaves, rng, gain=0.52):
    out = np.zeros(shape, np.float32)
    amp, sc, tot = 1.0, base, 0.0
    for _ in range(octaves):
        out += amp * _noise(shape, sc, rng)
        tot += amp
        amp *= gain
        sc /= 2.0
        if sc < 1.5:
            break
    return out / tot


def build():
    path = os.path.join(CACHE, "terrain.npz")
    if os.path.exists(path):
        d = np.load(path)
        return {k: d[k].astype(np.float32) for k in d.files}
    os.makedirs(CACHE, exist_ok=True)
    rng = np.random.default_rng(11)
    shp = (MH, MW)
    y = np.mgrid[0:MH, 0:MW][0].astype(np.float32)
    warp = fbm(shp, 600, 4, rng)
    # geological strata, gently folded
    strata_phase = y / 46.0 + warp * 5.5 + fbm(shp, 1400, 2, rng) * 9
    strata = np.sin(strata_phase) * 0.5 + 0.5
    strata = strata ** 3
    rock = fbm(shp, 380, 8, rng)
    ridged = 1 - np.abs(fbm(shp, 220, 7, rng))
    ridged = ridged ** 3
    fine = fbm(shp, 18, 3, rng)
    hgt = rock * 0.9 + ridged * 0.85 + strata * 0.35 + fine * 0.08
    # fractures
    crack_n = fbm(shp, 300, 5, rng)
    cracks = np.exp(-(crack_n / 0.035) ** 2)
    hgt -= cracks * 0.35
    # copper mineralisation: veins along a noise zero-set + disseminated flecks
    vein_n = fbm(shp, 520, 6, rng) + strata * 0.15
    vein = np.exp(-(vein_n / 0.05) ** 2)
    region = np.clip(fbm(shp, 700, 3, rng) * 0.9 + 0.2, 0, 1)
    fleck = np.clip((fbm(shp, 9, 2, rng) - 1.55) * 3, 0, 1) * region
    cu = np.clip(vein * (0.55 + region * 0.6) + fleck, 0, 1)
    cu = cv2.GaussianBlur(cu, (0, 0), 0.8)
    hgt += cu * 0.06
    # normals
    hs = hgt * 26.0
    gx = cv2.Sobel(hs, cv2.CV_32F, 1, 0, ksize=3) / 8
    gy = cv2.Sobel(hs, cv2.CV_32F, 0, 1, ksize=3) / 8
    nz = 1 / np.sqrt(gx ** 2 + gy ** 2 + 1)
    nx, ny = -gx * nz, -gy * nz
    # cavity / ambient occlusion
    cav = hgt - cv2.GaussianBlur(hgt, (0, 0), 12)
    ao = np.clip(0.75 + cav * 1.1, 0.25, 1.15)
    # albedo: charcoal / mineral-gray stone with strata tint; copper where mineralised
    tone = np.clip(0.55 + rock * 0.12 + strata * 0.18 + fine * 0.05, 0.2, 1)
    stone = np.array(PAL["gray"], np.float32) * 0.42
    char = np.array(PAL["charcoal"], np.float32) * 0.9
    alb = char[None, None] * (1 - tone[..., None]) + stone[None, None] * tone[..., None]
    copper = np.array(PAL["copper"], np.float32)
    alb = alb * (1 - cu[..., None]) + copper[None, None] * cu[..., None] * 0.95
    alb *= ao[..., None]
    data = dict(nx=nx, ny=ny, nz=nz, alb=alb, cu=cu, hgt=hgt)
    np.savez(path, **{k: v.astype(np.float16) for k, v in data.items()})
    return data


_T = None


def T():
    global _T
    if _T is None:
        _T = build()
    return _T


def render(cx, cy, zoom, light_az, light_el, pool_xy, pool_r, exposure=1.0, out_w=W, out_h=H,
           copper_boost=1.0, ambient=0.035):
    """Shade a camera window centred at map (cx, cy). zoom>1 = closer. pool in screen px."""
    t = T()
    vw, vh = out_w / zoom, out_h / zoom
    x0, y0 = cx - vw / 2, cy - vh / 2
    # affine from output pixels to map coords
    M = np.float32([[1 / zoom, 0, x0], [0, 1 / zoom, y0]])

    def samp(a):
        return cv2.warpAffine(a, M, (out_w, out_h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                              borderMode=cv2.BORDER_REFLECT)

    nx, ny, nz = samp(t["nx"]), samp(t["ny"]), samp(t["nz"])
    alb, cu = samp(t["alb"]), samp(t["cu"])
    L = np.array([np.cos(light_az) * np.cos(light_el), np.sin(light_az) * np.cos(light_el), np.sin(light_el)],
                 np.float32)
    ndl = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
    Hh = L + np.array([0, 0, 1], np.float32)
    Hh /= np.linalg.norm(Hh)
    ndh = np.clip(nx * Hh[0] + ny * Hh[1] + nz * Hh[2], 0, 1)
    spec_cu = ndh ** 60 * cu * 3.2 * copper_boost
    spec_st = ndh ** 14 * (1 - cu) * 0.10
    yy, xx = np.ogrid[0:out_h, 0:out_w]
    pool = np.exp(-(((xx - pool_xy[0]) ** 2 + ((yy - pool_xy[1]) * 1.25) ** 2) / (2 * pool_r ** 2))).astype(
        np.float32)
    lit = ndl * pool * 1.9
    cu_col = np.array([1.0, 0.70, 0.47], np.float32)
    img = alb * (ambient + lit)[..., None] + (spec_cu * pool)[..., None] * cu_col + (spec_st * pool)[..., None]
    img *= exposure
    return img, (spec_cu * pool)


def tonemap(img):
    """Gentle filmic curve keeping charcoal blacks and copper highlights."""
    x = np.maximum(img, 0)
    return (x * (1 + x / 2.2)) / (1 + x)
