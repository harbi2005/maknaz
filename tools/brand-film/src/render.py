"""Render driver.  python render.py stills 30 400 ...   |  python render.py video [workers]"""
import os
import subprocess
import sys
import time
from multiprocessing import Process

import cv2
import numpy as np

from config import FPS, H, N_FRAMES, OUT, SCENES, W, GRAIN, VIGNETTE
from lib import finish
import scenes


def render_frame(g):
    for name, a, b in SCENES:
        if a <= g < b:
            fr = scenes.SCENE_FNS[name](g - a, g)
            break
    fr = finish(fr.astype(np.float32), g, GRAIN, VIGNETTE)
    return (fr * 255 + 0.5).astype(np.uint8)


def stills(frames):
    os.makedirs(f"{OUT}/stills", exist_ok=True)
    for g in frames:
        t = time.time()
        im = render_frame(g)
        cv2.imwrite(f"{OUT}/stills/f{g:04d}.jpg", im[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(g, f"{time.time() - t:.2f}s", flush=True)


def worker(k, a, b):
    seg = f"{OUT}/seg_{k}.mp4"
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s",
                          f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast",
                          "-crf", "14", "-pix_fmt", "yuv420p", seg], stdin=subprocess.PIPE)
    t0 = time.time()
    for g in range(a, b):
        p.stdin.write(render_frame(g).tobytes())
        if (g - a) % 60 == 0:
            print(f"[w{k}] {g - a}/{b - a}  {time.time() - t0:.0f}s", flush=True)
    p.stdin.close()
    p.wait()


def video(nw=2, a=0, b=N_FRAMES):
    import terrain
    terrain.T()
    bounds = np.linspace(a, b, nw + 1).astype(int)
    ps = [Process(target=worker, args=(k, bounds[k], bounds[k + 1])) for k in range(nw)]
    [p.start() for p in ps]
    [p.join() for p in ps]
    with open(f"{OUT}/segs.txt", "w") as fh:
        for k in range(nw):
            fh.write(f"file 'seg_{k}.mp4'\n")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"{OUT}/segs.txt",
                    "-c", "copy", f"{OUT}/video_noaudio.mp4"], check=True)


if __name__ == "__main__":
    if sys.argv[1] == "stills":
        stills([int(x) for x in sys.argv[2:]])
    else:
        video(int(sys.argv[2]) if len(sys.argv) > 2 else 2)
