#!/usr/bin/env python3
"""
Smaller copies of the site 2 stills for the gallery, the Instagram strip and the CV.

    python3 scripts/video_stills_sizes.py

For every docs/video/assets/stills/NAME.jpg it writes NAME-960.jpg/.webp and NAME-480.jpg/.webp
(width 960 / 480, height to scale; never upscaled). Colour is untouched: only a Lanczos downscale.
The build picks the files up by name; nothing else needs editing. Needs Pillow (pip install pillow).
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
STILLS = ROOT / 'docs/video/assets/stills'

for src in sorted(STILLS.glob('*.jpg')):
    if src.stem.endswith(('-960', '-480')):
        continue
    im = Image.open(src).convert('RGB')
    for w in (960, 480):
        if im.width < w:
            continue
        h = round(im.height * w / im.width)
        small = im.resize((w, h), Image.LANCZOS)
        small.save(STILLS / f'{src.stem}-{w}.jpg', quality=84, optimize=True, progressive=True)
        small.save(STILLS / f'{src.stem}-{w}.webp', quality=80, method=6)
    print(src.name)
