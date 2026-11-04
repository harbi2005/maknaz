"""MAKNAZ film — central configuration: brand palette, typography, timing, motion."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # tools/brand-film
REPO = os.path.dirname(os.path.dirname(ROOT))                                  # repository root
ASSETS = os.path.join(REPO, "brand", "logo")
FONTS_DIR = os.path.join(REPO, "brand", "fonts")
CACHE = os.path.join(ROOT, "cache")    # git-ignored
OUT = os.path.join(ROOT, "out")        # git-ignored

W, H, FPS = 1920, 1080, 30
DURATION_S = 60
N_FRAMES = DURATION_S * FPS


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


# ---- Brand palette (from the brief / identity board) --------------------------------
PAL = {
    "charcoal": hex2rgb("#25292B"),
    "gray": hex2rgb("#858D8E"),
    "copper": hex2rgb("#B8734F"),
    "sand": hex2rgb("#E9E5DD"),
    "off": hex2rgb("#F7F6F1"),
}


def shade(name, k):
    """Darker/lighter tone of a palette colour (no new hues)."""
    return tuple(min(1.0, c * k) for c in PAL[name])


# ---- Typography -----------------------------------------------------------------------
# Brand fonts are Tajawal (Arabic) and Montserrat (Latin). Drop the .ttf files into
# fonts/ and they are picked up automatically. Fallbacks are used only if missing.
def _first(*paths):
    for p in paths:
        if p and os.path.exists(p):
            return p
    raise FileNotFoundError(paths)


TJ = os.path.join(FONTS_DIR, "tajawal")
PLEX = os.path.join(FONTS_DIR, "ibm-plex-sans")
FONT = {
    "ar_light": _first(f"{TJ}/Tajawal-Light.ttf"),
    "ar_regular": _first(f"{TJ}/Tajawal-Regular.ttf"),
    "ar_bold": _first(f"{TJ}/Tajawal-Bold.ttf"),
    # Montserrat (brand Latin face) is not bundled yet; add Montserrat-*.ttf to brand/fonts/montserrat to use it.
    "lat_light": _first(f"{FONTS_DIR}/montserrat/Montserrat-Light.ttf", f"{PLEX}/IBMPlexSans[wdth,wght].ttf"),
    "lat_regular": _first(f"{FONTS_DIR}/montserrat/Montserrat-Regular.ttf", f"{PLEX}/IBMPlexSans[wdth,wght].ttf"),
    "lat_medium": _first(f"{FONTS_DIR}/montserrat/Montserrat-Medium.ttf", f"{PLEX}/IBMPlexSans[wdth,wght].ttf"),
}

# ---- Timeline (frames) -------------------------------------------------------------
def s(sec):
    return int(round(sec * FPS))


SCENES = [
    ("s1_overlooked", 0, s(7)),
    ("s2_gap", s(7), s(15)),
    ("s3_discovery", s(15), s(23)),
    ("s4_workflow", s(23), s(39.5)),
    ("s5_transform", s(39.5), s(49)),
    ("s6_finale", s(49), s(60)),
]

# ---- Motion -----------------------------------------------------------------------
EASE = {
    "out": (0.16, 1.0, 0.3, 1.0),      # expo-like settle
    "inout": (0.65, 0.0, 0.35, 1.0),   # cinematic camera
    "in": (0.55, 0.0, 0.9, 0.4),
    "soft": (0.25, 0.1, 0.25, 1.0),
}
TEXT_REVEAL_FRAMES = 26
TEXT_SOFT_EDGE = 140      # px softness of the reading-direction wipe
GRAIN = 0.018
VIGNETTE = 0.42
