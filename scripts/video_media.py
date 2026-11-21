#!/usr/bin/env python3
"""
Builds every video asset for the videographer site (docs/video/assets/) and the
"Личная съёмка" teaser loops for site 1 (docs/assets/videography/).

    python3 scripts/video_media.py [pieces] [reels] [stills] [site1] [manifest]

With no arguments it runs everything. Sources: source/disk2/ (not in git).
Needs ffmpeg/ffprobe, cwebp and Pillow. Colour is never re-graded: frames are only
cropped, scaled, converted to 30 fps and re-encoded. Web clips are never upscaled; only the
showreels enlarge the 720 px Instagram sources to fill a 1080x1920 frame. Every output is
silent: all source clips carry library music (see source/disk2-notes.md).
The edit decision lists here are the same as in source/disk2-notes.md.
"""
import json, os, subprocess, sys, shutil, tempfile
from PIL import Image, ImageFilter, ImageStat

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'source/disk2')
OUT = os.path.join(ROOT, 'docs/video/assets')
SITE1 = os.path.join(ROOT, 'docs/assets/videography')
FF, FP = '/usr/local/bin/ffmpeg', '/usr/local/bin/ffprobe'
X264 = ['-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', 'slow',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        '-movflags', '+faststart', '-an']

def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

def probe(path):
    o = subprocess.check_output([FP, '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                 'stream=width,height:format=duration', '-of', 'json', path])
    j = json.loads(o)
    return j['streams'][0]['width'], j['streams'][0]['height'], float(j['format']['duration'])

# ---- crops (applied before scaling; all keep the source's own framing) ----
C = {
    'none': None,
    'h1072': 'crop=1904:1072',          # 1920x1072 -> 16:9
    'h1074': 'crop=1908:1074',          # 1920x1074 -> 16:9 (also removes the thin black side bars)
    'scope': 'crop=1920:816:0:0',       # animals-1: top 2.35:1, drops the burned-in caption
    'dome': 'crop=552:980:84:300',      # travel-4: everything below her burned-in caption (text sits at y 240-290)
}
def band(b, aspect='169'):
    """travel-2 is three 2160x1280 clips stacked; take band b (0 top)."""
    return f'crop=2160:1216:0:{b*1280+32}' if aspect == '169' else f'crop=2160:1280:0:{b*1280}'

def _parse(crop):
    v = [int(x) for x in crop.split('=')[1].split(':')]
    return (v + [None, None])[:4]

def v916(src, xc, base=None):
    """A 9:16 window from a horizontal source (or from a crop of it), centred at xc (0..1 of the width)."""
    if base:
        w, h, ox, oy = _parse(C.get(base, base))
        if ox is None:  # crop=W:H centres by default
            sw, sh, _ = probe(os.path.join(SRC, src)); ox, oy = (sw - w) // 2, (sh - h) // 2
    else:
        (w, h, _), ox, oy = probe(os.path.join(SRC, src)), 0, 0
    cw = int(round(h * 9 / 16 / 2) * 2)
    x = int(min(max(0, xc * w - cw / 2), w - cw)) // 2 * 2
    return f'crop={cw}:{h}:{ox + x}:{oy}'

def seg(src, i, o, crop='none'):
    return {'src': src, 'in': round(i, 3), 'out': round(o, 3), 'crop': C.get(crop, crop)}

# ---------------------------------------------------------------- pieces
# Order inside a group = order on the page. size = (w, h) of the web clip; never above the source
# (Instagram downloads stay at their own 720x1280, the dome crop at 540x960).
PIECES = [
  # Hospitality & Tourism: the places to stay lead, the public landscapes follow
  dict(id='mountain-dome', group='hospitality', orient='v', size=(540, 960),
       segs=[seg('travel-4.mp4', 6.65, 14.1, 'dome')],
       poster=('travel-4.mp4', 12.9, 'dome'), loop=[seg('travel-4.mp4', 9.2, 14.1, 'dome')],
       title={'ru': 'Купол с видом на горы', 'en': 'A dome with a mountain view'},
       caption={'ru': 'Облака над долиной, малина в пледе и вид из стеклянного купола.',
                'en': 'Clouds over the valley, raspberries in a blanket and the view from a glass dome.'},
       alt={'ru': 'Двое в пледах смотрят на горы из стеклянного купола',
            'en': 'Two people wrapped in blankets look at the mountains from a glass dome'},
       note='Her Instagram edit carries a caption in the upper fifth («как ощущается жизнь в горах»); the web version is cropped below it (552x980 of 720x1280, shown at 540x960). A clean export would allow the full frame.'),
  dict(id='camper', group='hospitality', orient='v', size=(720, 1280),
       segs=[seg('cabin-1.mp4', 0.0, 1.33), seg('cabin-1.mp4', 2.2, 4.57)],
       poster=('cabin-1.mp4', 2.5, 'none'), loop=[seg('cabin-1.mp4', 2.2, 4.57)],
       title={'ru': 'Кемпер в берёзовой роще', 'en': 'A camper in a birch grove'},
       caption={'ru': 'Гирлянды, гамак, льняные флажки и постель у окна.',
                'en': 'String lights, a hammock, linen bunting and a bed by the window.'},
       alt={'ru': 'Гамак и льняные флажки между берёзами', 'en': 'A hammock and linen bunting between birch trees'},
       note='The shot with the trailer maker\'s logo (1.33-2.2 s) is cut out of the clip, the poster and the loop.'),
  dict(id='rain-house', group='hospitality', orient='v', size=(720, 1280), stacked=True,
       segs=[seg('location-2.mp4', 0.0, 5.95)],
       poster=('location-2.mp4', 0.9, 'none'), loop=[seg('location-2.mp4', 0.0, 5.95)],
       title={'ru': 'Дом в дождь', 'en': 'A house in the rain'},
       caption={'ru': 'Стеклянная стена, мокрая терраса и тыква на перилах: уют в непогоду.',
                'en': 'A glass wall, a wet terrace and a pumpkin on the railing: comfort in bad weather.'},
       alt={'ru': 'Три кадра друг над другом: терраса под дождём, гостиная, деревья в тумане',
            'en': 'Three stacked frames: a terrace in the rain, a living room, trees in the fog'}),
  dict(id='mountain-lake', group='hospitality', orient='h', segs=[seg('travel-1.mp4', 0.0, 10.6, 'h1072')],
       poster=('travel-1.mp4', 9.4, 'h1072'), loop=[seg('travel-1.mp4', 5.6, 10.6, 'h1072')],
       title={'ru': 'Горное озеро', 'en': 'Mountain lake'},
       caption={'ru': 'Тропа, деревянные ступени и бирюзовая вода: день у горного озера.',
                'en': 'A trail, wooden steps and turquoise water: a day at a mountain lake.'},
       alt={'ru': 'Бирюзовое озеро между лесистых гор, вид сверху с тропы',
            'en': 'A turquoise lake between forested mountains, seen from the trail above'}),
  dict(id='canyon', group='hospitality', orient='h', segs=[seg('travel-3.mp4', 0.0, 8.9)],
       poster=('travel-3.mp4', 6.1, 'none'), loop=[seg('travel-3.mp4', 0.2, 5.6)],
       title={'ru': 'Каньон в степи', 'en': 'A canyon in the steppe'},
       caption={'ru': 'Красные скалы, сухие травы и полуденный свет.',
                'en': 'Red rock, dry grass and midday light.'},
       alt={'ru': 'Красные скалы каньона под ярким небом', 'en': 'Red canyon rocks under a bright sky'}),
  # Lifestyle & Places
  dict(id='lake-reading', group='lifestyle', orient='h', segs=[seg('lifestyle-3.mp4', 10.05, 21.8)],
       poster=('lifestyle-3.mp4', 11.6, 'none'), loop=[seg('lifestyle-3.mp4', 10.1, 15.05)],
       title={'ru': 'Книга у озера', 'en': 'A book by the lake'},
       caption={'ru': 'Термос, книга с картой, вороны на песке и горы за водой.',
                'en': 'A thermos, a book with a map, crows on the sand and mountains across the water.'},
       alt={'ru': 'Рука с кружкой из термоса, плед и озеро', 'en': 'A hand holding a thermos cup, a blanket and the lake'}),
  dict(id='lavender-garden', group='lifestyle', orient='h', segs=[seg('lifestyle-4.mp4', 8.85, 18.25)],
       poster=('lifestyle-4.mp4', 15.6, 'none'), loop=[seg('lifestyle-4.mp4', 14.24, 18.28)],
       title={'ru': 'Лаванда и горы', 'en': 'Lavender and mountains'},
       caption={'ru': 'Терраса с видом на вершины, долина с рекой, мальвы и лаванда у каменной стены.',
                'en': 'A terrace facing the peaks, a river valley, mallows and lavender by a stone wall.'},
       alt={'ru': 'Кусты лаванды у каменной стены', 'en': 'Lavender bushes by a stone wall'}),
  dict(id='summer-festival', group='lifestyle', orient='h', segs=[seg('festival.mp4', 15.6, 22.85), seg('festival.mp4', 26.35, 30.85)],
       poster=('festival.mp4', 18.6, 'none'), loop=[seg('festival.mp4', 16.0, 21.0)],
       title={'ru': 'Летний праздник у воды', 'en': 'A summer festival by the water'},
       caption={'ru': 'Свет сквозь иву, венки на воде, цветы в отражениях.',
                'en': 'Light through the willow, wreaths on the water, flowers in reflections.'},
       alt={'ru': 'Люди в белом у пруда, лучи солнца сквозь иву', 'en': 'People in white by a pond, sun rays through a willow'}),
  dict(id='winter-triptych', group='lifestyle', orient='v', size=(720, 1280), stacked=True, segs=[seg('lifestyle-1.mp4', 0.0, 4.2)],
       poster=('lifestyle-1.mp4', 2.0, 'none'), loop=[seg('lifestyle-1.mp4', 0.0, 4.2)],
       title={'ru': 'Зима в трёх кадрах', 'en': 'Winter in three frames'},
       caption={'ru': 'Солнце в зимнем лесу, иней на шапке, снег на хвое.',
                'en': 'Sun in a winter forest, frost on a knitted hat, snow on pine needles.'},
       alt={'ru': 'Три кадра друг над другом: заснеженный лес, глаз под вязаной шапкой, ветка в снегу',
            'en': 'Three stacked frames: a snowy forest, an eye under a knitted hat, a snowy branch'}),
  # Brands & Products
  dict(id='journal', group='brands', orient='h', segs=[seg('product.mp4', 0.0, 14.6)],
       poster=('product.mp4', 10.7, 'none'), loop=[seg('product.mp4', 6.75, 11.2)],
       title={'ru': 'Блокнот и подвески', 'en': 'A journal and its charms'},
       caption={'ru': 'Кожаная обложка, подвески, страницы с рисунками и кошка, которая всё проверяет первой.',
                'en': 'A leather cover, charms, drawn pages, and a cat who checks everything first.'},
       alt={'ru': 'Подвеска со звёздами на кожаном блокноте', 'en': 'A star charm on a leather journal'}),
  dict(id='vch-books', group='brands', orient='v', size=(1080, 1920),
       segs=[seg('product-vch.mov', 0.0, 4.98), seg('product-vch.mov', 8.83, 13.55), seg('product-vch.mov', 15.85, 20.6)],
       poster=('product-vch.mov', 2.0, 'none'), loop=[seg('product-vch.mov', 0.3, 4.9)],
       title={'ru': 'Книги при свечах', 'en': 'Books by candlelight'},
       caption={'ru': 'Предметная съёмка, которую я сделала для своего шоу «Ведьмин час».',
                'en': 'A product shoot I made for my own show, Witching Hour.'},
       alt={'ru': 'Рука в кружевной манжете берёт книгу с полки при свечах',
            'en': 'A hand in a lace cuff takes a book from a candle-lit shelf'},
       note='Shows published book editions. The two shots where a cover title is the subject (4.98-8.83, 13.55-15.85) are cut; the poster is the hand at the shelf.'),
  # Nature & animals (personal)
  dict(id='dog-details', group='nature', orient='h', segs=[seg('animals-2.mp4', 0.0, 13.1, 'h1072')],
       poster=('animals-2.mp4', 5.9, 'h1072'), loop=[seg('animals-2.mp4', 4.95, 9.9, 'h1072')],
       title={'ru': 'Собака крупным планом', 'en': 'A dog, up close'},
       caption={'ru': 'Нос, глаз, лапа на досках, шерсть в траве.',
                'en': 'A nose, an eye, a paw on the boards, fur in the grass.'},
       alt={'ru': 'Глаз светлой собаки крупным планом', 'en': 'Close-up of a light-coated dog\'s eye'}),
  dict(id='cat-details', group='nature', orient='h', size=(1920, 816), segs=[seg('animals-1.mp4', 0.0, 14.25, 'scope')],
       poster=('animals-1.mp4', 2.3, 'scope'), loop=[seg('animals-1.mp4', 1.55, 6.5, 'scope')],
       title={'ru': 'Кошка в деталях', 'en': 'A cat in detail'},
       caption={'ru': 'Усы, лапы и хвост: домашний портрет.',
                'en': 'Whiskers, paws and a tail: a portrait at home.'},
       alt={'ru': 'Трёхцветная кошка крупным планом', 'en': 'A calico cat in close-up'},
       note='Cropped to 2.35:1 (top of frame) to remove the burned-in caption «a million little details to love».'),
  dict(id='cat-in-grass', group='nature', orient='h', segs=[seg('lifestyle-5.mp4', 1.55, 4.5, 'h1074'), seg('lifestyle-5.mp4', 6.55, 12.9, 'h1074')],
       poster=('lifestyle-5.mp4', 11.0, 'h1074'), loop=[seg('lifestyle-5.mp4', 7.8, 12.85, 'h1074')],
       title={'ru': 'Кошка в траве', 'en': 'A cat in the grass'},
       caption={'ru': 'Прогулка на шлейке: высокая трава и мягкий приглушённый свет.',
                'en': 'A walk on a harness: tall grass and soft, muted light.'},
       alt={'ru': 'Пушистая трёхцветная кошка лежит в траве', 'en': 'A fluffy calico cat lying in the grass'}),
  dict(id='taiga-river', group='nature', orient='h',
       segs=[seg('travel-2.mp4', 0.05, 2.45, band(0)), seg('travel-2.mp4', 0.05, 2.45, band(2)),
             seg('travel-2.mp4', 7.55, 9.95, band(2)), seg('travel-2.mp4', 12.55, 14.95, band(1))],
       poster=('travel-2.mp4', 8.8, band(2)),
       loop=[seg('travel-2.mp4', 0.05, 2.45, band(2)), seg('travel-2.mp4', 7.55, 9.95, band(2))],
       title={'ru': 'Река в тайге', 'en': 'A river in the taiga'},
       caption={'ru': 'Сосны, дымка над водой и собака, которая идёт первой.',
                'en': 'Pines, haze over the water and a dog leading the way.'},
       alt={'ru': 'Светлая собака на скале над широкой рекой', 'en': 'A light-coated dog on a rock above a wide river'},
       note='Re-cut from her 3-band stacked edit (travel-2): single bands, 16:9, no faces, no app watermark.'),
  dict(id='birdhouse-story', group='nature', orient='h', segs=[seg('story.mp4', 31.05, 41.3)],
       poster=('story.mp4', 31.6, 'none'), loop=[seg('story.mp4', 32.45, 37.3)],
       title={'ru': 'История одной кормушки', 'en': 'The story of a bird feeder'},
       caption={'ru': 'Расписная кормушка в берёзовой роще, семечки и белка.',
                'en': 'A painted bird feeder in a birch grove, seeds and a squirrel.'},
       alt={'ru': 'Расписная кормушка-домик на берёзе', 'en': 'A painted house-shaped bird feeder on a birch tree'}),
]

def chain(s, w, h, extra=''):
    f = [s['crop']] if s['crop'] else []
    f += [f'scale={w}:{h}:flags=lanczos:out_range=tv', 'setsar=1', 'fps=30', 'format=yuv420p']
    if extra: f.append(extra)
    return ','.join(f)

def encode(head, out, crf=None, target=None, dur=None):
    """head = ffmpeg args up to (and incl.) -map. crf mode, or 2-pass VBR aimed at `target` bytes."""
    if target is None:
        run(head + ['-crf', str(crf)] + X264 + [out])
    else:
        kbps = int(target * 8 / dur / 1000 * 0.96)
        log = os.path.join(tempfile.gettempdir(), f'x264-{os.getpid()}')
        rate = ['-b:v', f'{kbps}k', '-maxrate', f'{int(kbps*1.6)}k', '-bufsize', f'{kbps*3}k', '-passlogfile', log]
        run(head + rate + ['-pass', '1'] + X264[:-3] + ['-an', '-f', 'null', '/dev/null'])
        run(head + rate + ['-pass', '2'] + X264 + [out])
    return os.path.getsize(out)

def render_head(segs, w, h, post=''):
    """ffmpeg args that concatenate segments (each cropped + scaled to w x h)."""
    cmd = [FF, '-v', 'error', '-y']
    fc = []
    for k, s in enumerate(segs):
        cmd += ['-ss', str(s['in']), '-t', str(round(s['out'] - s['in'], 3)), '-i', os.path.join(SRC, s['src'])]
        fc.append(f'[{k}:v]{chain(s, w, h)}[v{k}]')
    fc.append(''.join(f'[v{k}]' for k in range(len(segs))) + f'concat=n={len(segs)}:v=1:a=0' + (f',{post}' if post else '') + '[out]')
    return cmd + ['-filter_complex', ';'.join(fc), '-map', '[out]']

def sharpness(img):
    g = img.convert('L').filter(ImageFilter.FIND_EDGES)
    return ImageStat.Stat(g).var[0]

def best_frame(src, t, crop, w, h, window=0.25, step=0.05):
    """Sharpest frame within +-window of t (source time), returned at w x h."""
    tmp = tempfile.mkdtemp()
    best = None
    n = int(round(2 * window / step)) + 1
    for k in range(n):
        tt = max(0, t - window + k * step)
        p = os.path.join(tmp, f'{k}.png')
        vf = ','.join(([crop] if crop else []) + [f'scale={w}:{h}:flags=lanczos', 'setsar=1'])
        run([FF, '-v', 'error', '-y', '-ss', f'{tt:.3f}', '-i', os.path.join(SRC, src), '-frames:v', '1', '-vf', vf, p])
        im = Image.open(p).convert('RGB')
        s = sharpness(im.resize((w // 2, h // 2)))
        if not best or s > best[0]:
            best = (s, tt, im)
    shutil.rmtree(tmp)
    return best[2], best[1]

def save_img(im, base, q=84, wq=78):
    im.save(base + '.jpg', quality=q, optimize=True, progressive=True)
    run(['cwebp', '-quiet', '-q', str(wq), base + '.jpg', '-o', base + '.webp'])
    return os.path.getsize(base + '.jpg'), os.path.getsize(base + '.webp')

def piece_dims(p):
    if 'size' in p: return p['size']
    return (1920, 1080) if p['orient'] == 'h' else (720, 1280)

CLIP_BPS = 520_000   # bytes per second of a full clip: about 4.2 Mbit/s, so 1080p foliage and water stay crisp
LOOP_SM, LOOP_LG = 450_000, 1_100_000

def build_pieces():
    for d in ('clips', 'posters', 'loops'): os.makedirs(f'{OUT}/{d}', exist_ok=True)
    state = os.path.join(ROOT, 'source/.video_pieces.json')
    res = json.load(open(state)) if os.path.exists(state) else {}
    only = [a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('only=')]
    only = only[0] if only else None
    parts = [a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('parts=')]
    parts = parts[0] if parts else ['clip', 'poster', 'loop']
    for p in PIECES:
        if only and p['id'] not in only: continue
        r = res.setdefault(p['id'], {})
        w, h = piece_dims(p)
        r.update(w=w, h=h, duration=round(sum(s['out'] - s['in'] for s in p['segs']), 2))
        if 'clip' in parts:
            limit = min(9_000_000, int(r['duration'] * CLIP_BPS))
            b, crf = fit(p['segs'], w, h, f"{OUT}/clips/{p['id']}.mp4", 22, limit)
            r.update(clip_bytes=b, crf=crf)
        if 'poster' in parts:
            src, t, crop = p['poster']
            im, tt = best_frame(src, t, C.get(crop, crop), w, h)
            save_img(im, f"{OUT}/posters/{p['id']}", q=80, wq=72)
            for sw in (960, 480):
                if sw >= w: continue
                sh = round(h * sw / w / 2) * 2
                save_img(im.resize((sw, sh), Image.LANCZOS), f"{OUT}/posters/{p['id']}-{sw}", q=82, wq=76)
            r.update(poster_t=round(tt, 2))
        if 'loop' in parts:
            lw = 360; lh = round(h * lw / w / 2) * 2
            lb, lcrf = fit(p['loop'], lw, lh, f"{OUT}/loops/{p['id']}.mp4", 27, LOOP_SM)
            gw = min(w, 720 if p['orient'] == 'h' else 540); gh = round(h * gw / w / 2) * 2
            gb, gcrf = fit(p['loop'], gw, gh, f"{OUT}/loops/{p['id']}-lg.mp4", 25, LOOP_LG)
            r.update(loop=(lw, lh, lb, lcrf), loop_lg=(gw, gh, gb, gcrf))
        print(p['id'], r, flush=True)
        json.dump(res, open(state, 'w'), indent=1)

def fit(segs, w, h, out, crf, limit, post='', cap=34):
    """Encode at `crf`; if the file is over `limit` bytes, re-encode 2-pass VBR aimed just under the limit.
    Returns (bytes, label) where label is 'crfNN' or 'vbrNNNk'."""
    head = render_head(segs, w, h, post)
    b = encode(head, out, crf=crf)
    if b <= limit:
        return b, f'crf{crf}'
    dur = sum(sg['out'] - sg['in'] for sg in segs)
    target = limit * 0.97
    for _ in range(3):
        b = encode(head, out, target=target, dur=dur)
        if b <= limit: break
        target *= limit / b * 0.97
    return b, f'vbr{int(target*8/dur/1000*0.96)}k'

# ---------------------------------------------------------------- showreels
BG = '0x0b0807'  # site 1 deep brown-black: the matte beside vertical shots in the wide reel

# A reel is a list of shots. Kinds:
#   F  full frame (16:9 source into the 16:9 reel, or a 9:16 crop/source into the vertical reel)
#   P  pillar: a vertical source shown whole at full height on the dark matte (wide reel only), never upscaled much
#   CARD  the end card (source/reel-card-*.png, from scripts/reel-card.mjs)
F = lambda src, i, o, crop='none': ('full', seg(src, i, o, crop))
P = lambda src, i, o, crop='none': ('pillar', seg(src, i, o, crop))
CARD = lambda d: ('card', d)

# Wide showreel, 1920x1080, about 35 s. Opens on the candle-lit product shot and the places to stay, then
# landscapes, details, products; closes on the lake panorama and a name card. Shot lengths vary (1-3.5 s).
WIDE = [
    P('product-vch.mov', 0.3, 3.6),             # hand in a lace cuff, candle-lit shelf
    P('travel-4.mp4', 11.65, 14.15, 'dome'),    # glass dome, two people facing the mountains
    F('travel-1.mp4', 32.85, 36.1, 'h1072'),    # lake from above
    P('cabin-1.mp4', 2.2, 4.07),                # camper: bunting and hammock, bed by the window, birches
    P('location-2.mp4', 0.0, 1.95),             # house in the rain (her three-band format)
    F('travel-3.mp4', 0.2, 3.0),                # canyon, walker under the rock
    F('lifestyle-3.mp4', 10.1, 11.7),           # thermos cup by the lake
    F('lifestyle-4.mp4', 14.3, 17.3),           # lavender by the stone wall
    F('festival.mp4', 31.0, 33.5),              # flowers floating on the pond
    F('product.mp4', 10.25, 11.25),             # star charm macro
    F('product.mp4', 6.75, 9.2),                # cat sniffing the leather journal
    P('product-vch.mov', 11.45, 13.5),          # pop-up page
    F('lifestyle-4.mp4', 11.95, 13.95),         # mallows against the mountains
    F('travel-1.mp4', 8.55, 10.6, 'h1072'),     # lake panorama with boats
    CARD(2.6),
]
# Vertical showreel, 1080x1920, about 37 s: one full 9:16 frame at a time (no stacked bands except her own
# rain-house edit). Places first, the product chapter at ~0:08, then landscapes and details.
VW = lambda src, i, o, xc, base=None: ('full', {'src': src, 'in': i, 'out': o, 'crop': v916(src, xc, base)})
VERT = [
    F('travel-4.mp4', 11.65, 14.15, 'dome'),    # glass dome
    F('travel-4.mp4', 9.15, 11.6, 'dome'),      # raspberries in a blanket, valley
    F('cabin-1.mp4', 2.2, 4.07),                # camper
    F('location-2.mp4', 0.0, 1.95),             # house in the rain (her own three-band frame)
    F('product-vch.mov', 0.3, 3.8),             # hand, candles, books
    F('product-vch.mov', 11.45, 13.5),          # pop-up page
    VW('travel-1.mp4', 32.85, 35.85, 0.5, 'h1072'),   # lake from above
    VW('travel-3.mp4', 0.2, 3.0, 0.38),         # canyon rock and walker
    VW('lifestyle-4.mp4', 14.3, 17.3, 0.5),     # lavender
    VW('lifestyle-3.mp4', 10.1, 12.1, 0.3),     # thermos cup
    VW('festival.mp4', 31.0, 33.5, 0.5),        # flowers on the water
    VW('product.mp4', 6.75, 9.2, 0.56),         # cat and journal
    VW('travel-2.mp4', 7.6, 10.0, 0.8, band(2, 'full')),  # white dog on a rock above the river
    VW('travel-1.mp4', 8.55, 10.6, 0.5, 'h1072'),     # lake panorama
    CARD(2.6),
]
# Hero loops: autoplay backgrounds, silent, loop end to start. Not the showreel's opening.
HERO_WIDE = [
    F('travel-1.mp4', 32.85, 36.1, 'h1072'),    # lake from above
    F('lifestyle-4.mp4', 10.2, 11.85),          # green valley with a river
    F('lifestyle-4.mp4', 14.3, 17.3),           # lavender
    F('festival.mp4', 31.0, 34.0),              # flowers on the water
    F('travel-1.mp4', 8.55, 10.6, 'h1072'),     # lake panorama
]
HERO_VERT = [
    F('travel-4.mp4', 11.65, 14.15, 'dome'),    # glass dome with the view
    F('travel-4.mp4', 6.7, 9.1, 'dome'),        # clouds over the valley
    VW('travel-1.mp4', 32.85, 35.85, 0.5, 'h1072'),   # lake from above
    VW('lifestyle-4.mp4', 14.3, 16.8, 0.5),     # lavender
]

def frames(d): return int(round(d * 30))

def mezz(cmd_inputs, fc, out, n):
    run([FF, '-v', 'error', '-y'] + cmd_inputs + ['-filter_complex', fc, '-map', '[out]', '-frames:v', str(n),
         '-c:v', 'libx264', '-crf', '12', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-an', out])

def shot(kind, s, W, H, out):
    if kind == 'card':
        name = 'wide' if W > H else 'vertical'
        png = os.path.join(ROOT, f'source/reel-card-{name}.png')
        ins = ['-loop', '1', '-t', str(s + 0.2), '-i', png]
        return mezz(ins, f'[0:v]scale={W}:{H}:flags=lanczos,setsar=1,fps=30,format=yuv420p[out]', out, frames(s))
    d = s['out'] - s['in']
    ins = ['-ss', str(s['in']), '-t', str(d + 0.2), '-i', os.path.join(SRC, s['src'])]
    if kind == 'pillar':
        f = ([s['crop']] if s['crop'] else []) + [f'scale=-2:{H}:flags=lanczos:out_range=tv', 'setsar=1',
             f'pad={W}:{H}:(ow-iw)/2:0:color={BG}', 'fps=30', 'format=yuv420p']
        return mezz(ins, f'[0:v]{",".join(f)}[out]', out, frames(d))
    return mezz(ins, f'[0:v]{chain(s, W, H)}[out]', out, frames(d))

def assemble(parts, out, crf, limit, fade_in=0.6, fade_out=1.0):
    tmp = os.path.dirname(parts[0])
    lst = os.path.join(tmp, 'list.txt')
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    cat = os.path.join(tmp, os.path.basename(out) + '.cat.mp4')
    run([FF, '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', cat])
    _, _, T = probe(cat)
    vf = ','.join(([f'fade=t=in:st=0:d={fade_in}'] if fade_in else []) + ([f'fade=t=out:st={T-fade_out:.3f}:d={fade_out}'] if fade_out else [])) or 'null'
    head = [FF, '-v', 'error', '-y', '-i', cat, '-vf', vf, '-r', '30']
    b = encode(head, out, crf=crf)
    if b > limit:
        target = limit * 0.97
        for _ in range(3):
            b = encode(head, out, target=target, dur=T)
            if b <= limit: break
            target *= limit / b * 0.97
        crf = f'vbr{int(target*8/T/1000*0.96)}k'
    else:
        crf = f'crf{crf}'
    return cat, T, b, crf

def build_reels():
    tmp = tempfile.mkdtemp(prefix='reel-')
    os.makedirs(f'{OUT}/showreel', exist_ok=True)
    state = os.path.join(ROOT, 'source/.video_reels.json')
    info = json.load(open(state)) if os.path.exists(state) else {}
    only = [a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('reels=')]
    only = only[0] if only else None
    def make(name, shots, W, H, crf, limit, fin, fout):
        parts = []
        for k, (kind, s) in enumerate(shots):
            p = os.path.join(tmp, f'{name}-{k:02d}.mp4'); shot(kind, s, W, H, p); parts.append(p)
        return assemble(parts, f'{OUT}/showreel/{name}.mp4', crf, limit, fin, fout)
    jobs = [  # name, shots, W, H, crf, byte limit, fade in, fade out, poster time in the reel
        ('showreel-wide', WIDE, 1920, 1080, 22, 16_000_000, 0.6, 1.2, 14.0),
        ('showreel-vertical', VERT, 1080, 1920, 22, 16_000_000, 0.6, 1.2, 10.0),
        ('hero-wide', HERO_WIDE, 1280, 720, 26, 2_300_000, 0.0, 0, 1.5),
        ('hero-vertical', HERO_VERT, 540, 960, 27, 1_050_000, 0.0, 0, 1.2),
    ]
    for name, shots, W, H, crf, limit, fin, fout, pt in jobs:
        if only and name not in only: continue
        cat, T, b, crf = make(name, shots, W, H, crf, limit, fin, fout)
        w, h, _ = probe(cat)
        base = f'{OUT}/showreel/{name}-poster'
        for f in os.listdir(f'{OUT}/showreel'):
            if f.startswith(f'{name}-poster'): os.remove(f'{OUT}/showreel/{f}')
        pp = os.path.join(tmp, f'{name}-poster.png')
        run([FF, '-v', 'error', '-y', '-ss', str(pt), '-i', cat, '-frames:v', '1', pp])
        im = Image.open(pp).convert('RGB')
        save_img(im, base, q=84, wq=78)
        if w > 960:
            sw = 960 if w > h else 540; sh = round(h * sw / w / 2) * 2
            save_img(im.resize((sw, sh), Image.LANCZOS), f'{base}-{sw}', q=82, wq=76)
        info[name] = dict(w=w, h=h, duration=round(T, 2), bytes=b, crf=crf, poster_t=pt)
        print(name, info[name], flush=True)
        json.dump(info, open(state, 'w'), indent=1)
    shutil.rmtree(tmp)

# ---------------------------------------------------------------- stills
# (id, source, time, crop or None, ru alt, en alt). Each frame has one home on the page (see media.json "layout"):
# none of the gallery / Instagram / approach frames is also a card poster.
STILLS = [
    ('lake-from-above', 'travel-1.mp4', 34.6, None, 'Бирюзовое горное озеро среди елового леса, вид сверху', 'A turquoise mountain lake in a spruce forest, seen from above'),
    ('valley', 'lifestyle-4.mp4', 10.9, None, 'Зелёная долина с рекой и снежные вершины', 'A green valley with a river and snowy peaks'),
    ('mallow', 'lifestyle-4.mp4', 13.0, None, 'Розовые мальвы на фоне гор', 'Pink mallows against the mountains'),
    ('city-peaks', 'lifestyle-3.mp4', 22.4, None, 'Заснеженные вершины над парком', 'Snowy peaks above a park'),
    ('rock-sky', 'travel-3.mp4', 8.4, None, 'Красная скала каньона на фоне неба', 'A red canyon rock against the sky'),
    ('lupines', 'travel-1.mp4', 4.1, 'crop=1904:1072', 'Синие полевые цветы над горным озером', 'Blue wildflowers above a mountain lake'),
    ('river-path', 'travel-2.mp4', 1.2, 'crop=1024:1280:568:2560', 'Тропа между соснами спускается к реке', 'A path between pines leads down to the river'),
    ('wreath', 'festival.mp4', 28.5, 'crop=864:1080:432:0', 'Венок плывёт у золотой травы', 'A wreath floating by golden grass'),
    ('dog-portrait', 'animals-2.mp4', 15.8, 'crop=858:1072:953:0', 'Светлая собака лежит в траве', 'A light-coated dog lying in the grass'),
    ('lake-steps', 'travel-1.mp4', 0.7, 'crop=858:1072:1011:0', 'Деревянные ступени над горным озером', 'Wooden steps above a mountain lake'),
    ('candle-hand', 'product-vch.mov', 2.0, 'crop=1080:1080:0:560', 'Рука в кружевной манжете у полки со свечами', 'A hand in a lace cuff at a candle-lit shelf'),
    ('dome-view', 'travel-4.mp4', 12.9, 'crop=720:720:0:330', 'Вид на горы из стеклянного купола', 'The mountain view from a glass dome'),
    ('camper-bunting', 'cabin-1.mp4', 2.5, 'crop=720:900:0:120', 'Льняные флажки и гамак между берёзами', 'Linen bunting and a hammock between birches'),
]
STILL_MAX = 350_000
STILL_WINDOW = {'camper-bunting': 0.2}

def save_capped(im, base):
    """jpg (q88 first) and webp, each <= 350 KB: lower quality to 80, then the size, never upscale."""
    out = {}
    w0, h0 = im.size
    for fmt in ('jpg', 'webp'):
        size = im
        done = False
        for scale in (1.0, 1920 / max(w0, h0), 1600 / max(w0, h0), 1280 / max(w0, h0)):
            if scale > 1.0: continue
            if scale < 1.0: size = im.resize((round(w0 * scale / 2) * 2, round(h0 * scale / 2) * 2), Image.LANCZOS)
            for q in ((88, 85, 82, 80) if fmt == 'jpg' else (82, 78, 74)):
                path = f'{base}.{fmt}'
                if fmt == 'jpg': size.save(path, quality=q, optimize=True, progressive=True)
                else:
                    tmp = base + '.tmp.png'; size.save(tmp)
                    run(['cwebp', '-quiet', '-q', str(q), tmp, '-o', path]); os.remove(tmp)
                if os.path.getsize(path) <= STILL_MAX:
                    out[fmt] = dict(width=size.size[0], height=size.size[1], quality=q, bytes=os.path.getsize(path)); done = True; break
            if done: break
    return out

def build_stills():
    d = f'{OUT}/stills'
    os.makedirs(d, exist_ok=True)
    keep = {sid for sid, *_ in STILLS}
    for f in os.listdir(d):  # frames no longer listed are removed with their -480 / -960 copies
        if f.split('.')[0].rsplit('-', 1)[0] not in keep and f.split('.')[0] not in keep: os.remove(os.path.join(d, f))
    info = {}
    for sid, src, t, crop, ru, en in STILLS:
        w, h, _ = probe(os.path.join(SRC, src))
        if crop: w, h = [int(v) for v in crop.split('=')[1].split(':')[:2]]
        im, tt = best_frame(src, t, crop, w, h, window=STILL_WINDOW.get(sid, 0.3), step=0.03 if sid in STILL_WINDOW else 0.05)
        info[sid] = dict(src=src, t=round(tt, 2), source_size=(w, h), files=save_capped(im, f'{d}/{sid}'), alt={'ru': ru, 'en': en})
        print(sid, info[sid]['files'], flush=True)
    json.dump(info, open(os.path.join(ROOT, 'source/.video_stills.json'), 'w'), indent=1)
    run([sys.executable, os.path.join(ROOT, 'scripts/video_stills_sizes.py')])

# ---------------------------------------------------------------- site 1 teaser (docs/assets/videography)
SITE1_CLIPS = [  # (id, source, in, out, crop x-centre 0..1, ru title, en title)
    ('lavender', 'lifestyle-4.mp4', 14.3, 18.3, 0.5, 'Лаванда', 'Lavender'),
    ('willow-light', 'festival.mp4', 16.0, 21.0, 0.62, 'Свет сквозь иву', 'Light through the willow'),
    ('lake-above', 'travel-1.mp4', 33.0, 36.0, 0.45, 'Горное озеро', 'Mountain lake', [(8.55, 10.6, 0.5)]),
    ('flowers-water', 'festival.mp4', 31.0, 36.0, 0.5, 'Цветы на воде', 'Flowers on the water'),
    ('books-candles', 'product-vch.mov', 0.3, 5.0, None, 'Книги при свечах', 'Books by candlelight'),
    ('dog-eye', 'animals-2.mp4', 4.97, 7.2, 0.54, 'Собака крупно', 'A dog, up close', [(14.75, 17.0, 0.62)]),
]
def site1_crop(src, xc):
    w, h, _ = probe(os.path.join(SRC, src))
    if xc is None: return None, w, h
    cw = int(round(h * 9 / 16 / 2) * 2)
    x = int(min(max(0, xc * w - cw / 2), w - cw)) // 2 * 2
    return f'crop={cw}:{h}:{x}:0', cw, h

def build_site1():
    os.makedirs(SITE1, exist_ok=True)
    info = {}
    for cid, src, i, o, xc, ru, en, *more in SITE1_CLIPS:
        crop, cw, ch = site1_crop(src, xc)
        segs = [seg(src, i, o, crop or 'none')] + [seg(src, a, b, site1_crop(src, x)[0]) for a, b, x in (more[0] if more else [])]
        name = f'clip-{cid}'
        lb, lcrf = fit(segs, 360, 640, f'{SITE1}/{name}.mp4', 26, 450_000)
        im, tt = best_frame(src, (i + o) / 2, crop, 540, 960)
        save_img(im, f'{SITE1}/{name}', q=84, wq=78)
        save_img(im.resize((360, 640), Image.LANCZOS), f'{SITE1}/{name}-360', q=82, wq=76)
        info[cid] = dict(src=src, segments=[{k: v for k, v in x.items()} for x in segs], crop=crop, loop_bytes=lb, crf=lcrf, poster_t=round(tt, 2), title={'ru': ru, 'en': en})
        print(cid, info[cid], flush=True)
    json.dump(info, open(os.path.join(ROOT, 'source/.video_site1.json'), 'w'), indent=1)

# ---------------------------------------------------------------- manifest (content/video/media.json)
MUTED = ('All source clips carry a music track (beat-timed cuts; Instagram/CapCut library music audible in '
         'the spectrum). No licence, so every web file has no audio track at all.')
GROUP_TITLES = {
    'hospitality': {'ru': 'Отдых и путешествия', 'en': 'Hospitality & Tourism'},
    'lifestyle': {'ru': 'Лайфстайл и места', 'en': 'Lifestyle & Places'},
    'brands': {'ru': 'Бренды и предметы', 'en': 'Brands & Products'},
    'nature': {'ru': 'Природа и животные', 'en': 'Nature & Animals'},
}
EXCLUDED = [
    {'source': 'cabin-2.mp4', 'reason': 'Burned-in English caption over the whole clip; friends\' faces in close-up; 0.4 s cuts.'},
    {'source': 'lifestyle-2.mp4', 'reason': '3.6 s of 0.2 s flash cuts: too fast for the calm tone of the site.'},
    {'source': 'location-1.mp4 (almaty-dacha)', 'reason': 'Her caption «Алматинские дачи крадут сердца ♡» is burned into every frame (it sits mid-frame, so no crop removes it); the cut also ends on a car dashboard. Withdrawn until she sends a clean export.'},
    {'source': 'travel-2.mp4 (as published)', 'reason': 'Her 3-band stacked edit has two selfies of private people and an app watermark in some bands; re-cut as taiga-river from clean bands instead.'},
]

def vfile(path, base):
    w, h, d = probe(path) if path.endswith('.mp4') else (*Image.open(path).size, None)
    return {'path': os.path.relpath(path, ROOT), 'url': os.path.relpath(path, base), 'width': w, 'height': h,
            'bytes': os.path.getsize(path), 'duration': round(d, 2) if d else None,
            'format': path.rsplit('.', 1)[1]}

def build_manifest():
    names = {v: k for k, v in json.load(open(os.path.join(SRC, '_names.json'))).items()}
    base = os.path.join(ROOT, 'docs/video')
    pieces_state = json.load(open(os.path.join(ROOT, 'source/.video_pieces.json')))
    reels_state = json.load(open(os.path.join(ROOT, 'source/.video_reels.json')))
    stills_state = json.load(open(os.path.join(ROOT, 'source/.video_stills.json')))
    site1_state = json.load(open(os.path.join(ROOT, 'source/.video_site1.json')))
    def segs_out(segs):
        return [{'file': f"source/disk2/{x['src']}", 'original_name': names.get(x['src']), 'in': x['in'], 'out': x['out'],
                 'crop': x['crop']} for x in segs]
    pieces = []
    for p in PIECES:
        st = pieces_state[p['id']]
        f = lambda rel: vfile(os.path.join(OUT, rel), base)
        pieces.append({
            'id': p['id'], 'group': p['group'], 'orientation': 'vertical' if p['orient'] == 'v' else 'horizontal',
            **({'stacked': True} if p.get('stacked') else {}),
            'title': p['title'], 'caption': p['caption'], 'alt': p['alt'],
            'muted': True, 'muted_reason': MUTED,
            'duration': f(f"clips/{p['id']}.mp4")['duration'],
            'files': {
                'clip': f(f"clips/{p['id']}.mp4"),
                'poster': {'jpg': f(f"posters/{p['id']}.jpg"), 'webp': f(f"posters/{p['id']}.webp")},
                'poster_480': {'jpg': f(f"posters/{p['id']}-480.jpg"), 'webp': f(f"posters/{p['id']}-480.webp")},
                **({'poster_960': {'jpg': f(f"posters/{p['id']}-960.jpg"), 'webp': f(f"posters/{p['id']}-960.webp")}}
                   if os.path.exists(f"{OUT}/posters/{p['id']}-960.jpg") else {}),
                'loop': f(f"loops/{p['id']}.mp4"),
                'loop_lg': f(f"loops/{p['id']}-lg.mp4"),
            },
            'encode': st.get('crf'),
            'source': {'segments': segs_out(p['segs']), 'poster_frame': {'file': f"source/disk2/{p['poster'][0]}", 't': st.get('poster_t')},
                       'loop_segments': segs_out(p['loop'])},
            'note': p.get('note'),
        })
    reels = []
    LAYOUT = {'full': 'full frame', 'pillar': 'vertical source at full height on the dark matte', 'card': 'end card'}
    def edl_of(shots):
        out = []
        for k, (kind, s) in enumerate(shots):
            if kind == 'card':
                out.append({'shot': k + 1, 'layout': LAYOUT[kind], 'duration': s, 'file': 'source/reel-card-*.png (scripts/reel-card.mjs)'})
            else:
                out.append({'shot': k + 1, 'layout': LAYOUT[kind], 'duration': round(s['out'] - s['in'], 2), **segs_out([s])[0]})
        return out
    edl = {'showreel-wide': edl_of(WIDE), 'showreel-vertical': edl_of(VERT), 'hero-wide': edl_of(HERO_WIDE), 'hero-vertical': edl_of(HERO_VERT)}
    for name, st in reels_state.items():
        pf = f'{OUT}/showreel/{name}-poster'
        files = {'video': vfile(f'{OUT}/showreel/{name}.mp4', base),
                 'poster': {'jpg': vfile(pf + '.jpg', base), 'webp': vfile(pf + '.webp', base)}}
        small = [x for x in os.listdir(f'{OUT}/showreel') if x.startswith(f'{name}-poster-') and x.endswith('.jpg')]
        if small:
            sp = f"{OUT}/showreel/{small[0][:-4]}"
            files['poster_small'] = {'jpg': vfile(sp + '.jpg', base), 'webp': vfile(sp + '.webp', base)}
        reels.append({'id': name, 'kind': 'hero-loop' if name.startswith('hero') else 'showreel', 'draft': True,
                      'muted': True, 'muted_reason': 'Silent by design: no music is licensed. She can lay her own track in DaVinci from the EDL.',
                      'encode': st['crf'], 'poster_t_in_reel': st['poster_t'], 'files': files, 'edl': edl[name],
                      'alt': {'ru': 'Шоурил: горы, озёра, детали, животные и предметы из личной съёмки Алисы',
                              'en': 'Showreel: mountains, lakes, details, animals and objects from Alisa\'s personal footage'}})
    stills = []
    for sid, src, t, crop, ru, en in STILLS:
        st = stills_state[sid]
        stills.append({'id': sid, 'alt': {'ru': ru, 'en': en},
                       'files': {'jpg': vfile(f'{OUT}/stills/{sid}.jpg', base), 'webp': vfile(f'{OUT}/stills/{sid}.webp', base)},
                       'source': {'file': f'source/disk2/{src}', 'original_name': names.get(src), 't': st['t'], 'crop': crop,
                                  'source_size': st['source_size']}})
    site1 = []
    d1 = os.path.join(ROOT, 'docs')
    for cid, src, i, o, xc, ru, en, *more in SITE1_CLIPS:
        st = site1_state[cid]; b = f'{SITE1}/clip-{cid}'
        site1.append({'id': cid, 'title': {'ru': ru, 'en': en}, 'muted': True,
                      'files': {'loop': vfile(b + '.mp4', d1), 'poster': {'jpg': vfile(b + '.jpg', d1), 'webp': vfile(b + '.webp', d1)},
                                'poster_360': {'jpg': vfile(b + '-360.jpg', d1), 'webp': vfile(b + '-360.webp', d1)}},
                      'copy_json_entry': {'file': f'assets/videography/clip-{cid}.mp4', 'poster': f'assets/videography/clip-{cid}.jpg', 'title': {'ru': ru, 'en': en}},
                      'source': {'file': f'source/disk2/{src}', 'original_name': names.get(src), 'segments': st['segments']}})
    total = sum(os.path.getsize(os.path.join(r, x)) for r, _, fs in os.walk(OUT) for x in fs)
    count = sum(len(fs) for _, _, fs in os.walk(OUT))
    og = {lang: dict(vfile(f'{OUT}/{fn}', base), alt=alt) for lang, fn, alt in (
        ('ru', 'og.jpg', 'Бирюзовое горное озеро сверху и имя: Алиса Макаренко, видеограф, Алматы'),
        ('en', 'og-en.jpg', 'A turquoise mountain lake from above with the name: Alisa Makarenko, videographer, Almaty'))}
    m = {
        'generated': '2026-11-21', 'root': 'docs/video', 'total_bytes': total, 'file_count': count, 'budget_bytes': 160_000_000,
        'url_note': 'Every url is relative to docs/video/ (the RU page). Pages in docs/video/en/ or docs/video/cv/ prefix "../"; docs/video/en/cv/ prefixes "../../".',
        'notes': [
            'Personal footage only: no client work. Category = what the footage shows and who she wants to film for.',
            MUTED,
            'Colour is hers: frames were only cropped, scaled down (never up) and converted to 30 fps; no grading, no denoise.',
            'Showreels are DRAFTS cut from her material (the page says «черновой монтаж»); the EDL for DaVinci is in source/disk2-notes.md and in each reel entry. Needs her sign-off and, ideally, her own music.',
            'No burned-in captions on the page: mountain-dome is cropped below her Instagram caption; almaty-dacha is withdrawn until a clean export arrives.',
            'Clips: 1920x1080 for horizontal sources, native size for vertical ones (Instagram downloads 720x1280, the dome crop 540x960, the «Ведьмин час» shoot 1080x1920). Loops: 360 px for small cards, -lg (720/540 px) for large ones.',
            'Rebuild: python3 scripts/video_media.py (needs source/disk2/), OG: node scripts/video-og.mjs.',
        ],
        'groups': [{'id': k, 'title': v} for k, v in GROUP_TITLES.items()],
        'favicon': [
            {'rel': 'icon', 'href': '../assets/brand/favicon.svg', 'type': 'image/svg+xml'},
            {'rel': 'icon', 'href': '../assets/brand/favicon-32.png', 'sizes': '32x32', 'type': 'image/png'},
            {'rel': 'apple-touch-icon', 'href': '../assets/brand/apple-touch-icon.png'},
        ],
        'favicon_note': 'Reuses site 1 files in docs/assets/brand/ (not duplicated). href is relative to docs/video/; add one more "../" per level deeper.',
        'og': og,
        'showreels': reels,
        'pieces': pieces,
        'stills': stills,
        'excluded': EXCLUDED,
        'site1_videography': {
            'root': 'docs', 'url_note': 'urls relative to docs/ (site 1 RU page); for docs/en/ prefix "../".',
            'purpose': 'Short silent vertical loops (360x640) with posters for the «Личная съёмка» block of site 1, replacing the low-res Instagram tiles. Add them to videography.clips in content/copy.json using copy_json_entry.',
            'items': site1,
        },
    }
    os.makedirs(os.path.join(ROOT, 'content/video'), exist_ok=True)
    # keep what was edited by hand or added later: the "layout" block (which stills go where, read by the site build)
    # and pieces added with scripts/add-clip.mjs (ids this script does not know)
    mf = os.path.join(ROOT, 'content/video/media.json')
    if os.path.exists(mf):
        old = json.load(open(mf))
        known = {p['id'] for p in pieces}
        m['pieces'] += [p for p in old.get('pieces', []) if p['id'] not in known and 'add-clip' in (p.get('note') or '')]
        if 'layout' in old:
            m = {k: v for kv in [(k, v) if k != 'groups' else None for k, v in m.items()] for k, v in ([kv] if kv else [('groups', m['groups']), ('layout', old['layout'])])}
    json.dump(m, open(mf, 'w'), ensure_ascii=False, indent=1)
    print('manifest', total, count)

if __name__ == '__main__':
    steps = [a for a in sys.argv[1:] if '=' not in a] or ['pieces', 'reels', 'stills', 'site1', 'manifest']
    if 'pieces' in steps: build_pieces()
    if 'reels' in steps: build_reels()
    if 'stills' in steps: build_stills()
    if 'site1' in steps: build_site1()
    if 'manifest' in steps: build_manifest()
