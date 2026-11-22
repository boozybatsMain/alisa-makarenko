"""Hero portrait: cut-out with soft edges, colour-decontaminated fringe, bottom and right edge dissolving.
Usage (after mask.swift):  python3 scripts/portrait/cut.py photo.jpg mask.png portrait.png 1500
then: cwebp -q 86 -alpha_q 95 -m 6 -sharp_yuv portrait.png -o docs/assets/portrait.webp
X0..Y1 is the crop in source pixels (3024x4032 selfie of Nov 2026): adjust it for a new photo.
The noisy-edge "zone" (lower right) was specific to that photo's chair; harmless otherwise."""
import sys
from PIL import Image
import numpy as np
src, maskp, out = sys.argv[1:4]
H = int(sys.argv[4]) if len(sys.argv) > 4 else 1500
im = Image.open(src).convert('RGB')
m = Image.open(maskp).convert('L')
X0, Y0, X1, Y1 = 250, 180, 3024, 3420
im = im.crop((X0, Y0, X1, Y1)); m = m.crop((X0, Y0, X1, Y1))
rgb = np.asarray(im).astype(np.float32) / 255
a = np.asarray(m).astype(np.float32) / 255
# tighten the soft edge a little so no background tint survives in the fringe
t = np.clip((a - 0.12) / (0.92 - 0.12), 0, 1); a2 = t * t * (3 - 2 * t)
# colour decontamination: edge pixels take the colour of the nearby solid foreground
core = (a > 0.97).astype(np.float32)
def box(x, r, axis):
    pad = [(0, 0)] * x.ndim; pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(x, pad, mode='edge'), axis=axis)
    n = x.shape[axis]
    return (np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, range(0, n), axis=axis)) / (2 * r + 1)
def blur(x, r):
    x = x.astype(np.float32)
    for _ in range(3):
        x = box(box(x, r, 0), r, 1)
    return x
num = np.stack([blur(rgb[..., c] * core, 10) for c in range(3)], -1)
den = blur(core, 10)[..., None]
fg = np.where(den > 1e-3, num / np.maximum(den, 1e-3), rgb)
w = np.clip((0.97 - a) / 0.6, 0, 1)[..., None]  # 0 inside, 1 near the outer edge
col = rgb * (1 - w) + fg * w
h, wid = a2.shape
yy = np.linspace(0, 1, h)[:, None]; xx = np.linspace(0, 1, wid)[None, :]
# bottom dissolve (last 16 %), right edge (frame cut through the hair) softly faded over last 7 %
fb = np.clip((1 - yy) / 0.16, 0, 1); fb = fb * fb * (3 - 2 * fb)
fr = np.clip((1 - xx) / 0.07, 0, 1); fr = fr * fr * (3 - 2 * fr)
# the noisy chair edge low on the right: lean on a smoother mask there
sm = blur(a2, 18)
zone = np.clip((yy - 0.80) / 0.06, 0, 1) * np.clip((xx - 0.82) / 0.05, 0, 1)
a3 = a2 * (1 - zone) + np.minimum(a2, sm) * zone
alpha = a3 * fb * fr
outim = Image.fromarray(np.dstack([col * 255, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
W = round(wid * H / h)
outim = outim.resize((W, H), Image.LANCZOS)
outim.save(out)
print(W, H)
