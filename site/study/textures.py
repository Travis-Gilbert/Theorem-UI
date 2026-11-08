"""The room's two tileable surfaces, shaped from white noise with numpy's FFT and written with Pillow. Run from site/.

slate.jpg: matte slate for the desk, long cleft along the desk and fine tooth across it.
ripple.jpg: the normal map of the liquid glass over the Life, slow swells about 15 cm across at one tile per 1.2 m.
"""
import numpy as np
from PIL import Image

rng = np.random.default_rng(1968)


def shaped(n, amplitude):
    """White noise filtered in frequency by `amplitude(fx, fy)`, in cycles per tile, at unit variance."""
    fx = np.fft.rfftfreq(n, 1 / n)[None, :]
    fy = np.fft.fftfreq(n, 1 / n)[:, None]
    spectrum = (rng.normal(size=(n, n // 2 + 1)) + 1j * rng.normal(size=(n, n // 2 + 1))) * amplitude(fx, fy)
    spectrum[0, 0] = 0
    out = np.fft.irfft2(spectrum, s=(n, n))
    return (out - out.mean()) / out.std()


def power(exponent, stretch=1.0):
    def amplitude(fx, fy):
        f = np.sqrt((fx * stretch) ** 2 + fy ** 2)
        f[0, 0] = 1
        return f ** -exponent
    return amplitude


def slate():
    n = 1024
    height = 0.72 * shaped(n, power(1.35, stretch=7)) + 0.28 * shaped(n, power(0.35))
    # Near 1 everywhere, so one file can tint, roughen and bump the same material.
    image = np.clip(0.89 + 0.052 * height, 0.72, 1)
    Image.fromarray((image * 255).astype(np.uint8), 'L').save('public/study/slate.jpg', quality=88)


def ripple():
    n = 512
    swell = lambda fx, fy: np.exp(-(((np.sqrt(fx ** 2 + fy ** 2) - 8) / 5) ** 2))
    height = shaped(n, swell)
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / 2
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / 2
    scale = 0.3 / np.sqrt(dx ** 2 + dy ** 2).std()
    normal = np.dstack((-dx * scale, -dy * scale, np.ones_like(height)))
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    Image.fromarray(((normal * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save('public/study/ripple.jpg', quality=94)


slate()
ripple()


# The room from the owner's desk (evidence/refs/external/owner-desk-*.jpg). Each has its own generator, so the two
# above come out the same as before.
#
# wood.jpg: stained fir for the window casings, grain running up the image, one tile per 0.12 x 0.6 m.
# weave.jpg: a woven reed shade, reeds across and cords up, one tile per 0.3 m; the gaps are light coming through,
#   so the same image is the shade's colour and its glow.
# canvas.jpg: the canvas over the desk. An original faceted field in the colours of the owner's painting (greens, a
#   few blues and teals, gold and red-orange low in the middle). The painting itself is another artist's work and is
#   not reproduced: no figure, no composition of theirs, only its palette and the idea of facets.
# notebook.jpg: a ruled page with marks that read as handwriting from across the desk and as nothing up close.


def srgb(hex_color):
    return np.array([int(hex_color[i : i + 2], 16) for i in (1, 3, 5)], dtype=float)


def wood():
    r = np.random.default_rng(7)
    w, h = 512, 2560
    y, x = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    # Long, slow undulation of the grain, then the grain lines themselves.
    warp = np.cumsum(r.normal(size=(1, w)), axis=1)
    warp = (warp - warp.mean()) / (np.abs(warp).max() + 1e-6)
    drift = 0.06 * np.sin(2 * np.pi * (y * 1.3 + 0.2)) + 0.03 * np.sin(2 * np.pi * (y * 3.7 + 0.7))
    u = x + drift + 0.015 * warp
    lines = np.sin(2 * np.pi * (u * 23 + 0.4 * np.sin(2 * np.pi * u * 3)))
    lines = np.clip(lines, -1, 1) ** 3
    fine = shaped_with(r, (h, w), lambda fx, fy: np.exp(-((fy * 9) ** 2) / 4) / (1 + (fx / 40) ** 2))
    # Satin-stained fir: the grain is there when you look, not a stripe from across the room.
    t = np.clip(0.58 + 0.13 * lines + 0.07 * fine, 0, 1)[..., None]
    light, dark = srgb('#93603a'), srgb('#4e2b14')
    image = dark + (light - dark) * t
    Image.fromarray(image.astype(np.uint8), 'RGB').save('public/study/wood.jpg', quality=88)


def shaped_with(r, shape, amplitude):
    """Like shaped(), non-square and from its own generator."""
    h, w = shape
    fx = np.fft.rfftfreq(w, 1 / w)[None, :]
    fy = np.fft.fftfreq(h, 1 / h)[:, None]
    spectrum = (r.normal(size=(h, w // 2 + 1)) + 1j * r.normal(size=(h, w // 2 + 1))) * amplitude(fx, fy)
    spectrum[0, 0] = 0
    out = np.fft.irfft2(spectrum, s=(h, w))
    return (out - out.mean()) / out.std()


def weave():
    r = np.random.default_rng(11)
    n = 1024  # 0.3 m: one pixel is about 0.3 mm
    image = np.zeros((n, n, 3))
    # Light comes through only where two reeds part, and then only a thread of it.
    gap = srgb('#a8916c')
    image[:] = gap
    y = 0
    rows = []
    while y < n:
        thick = int(r.integers(11, 15))
        rows.append((y, thick))
        y += thick + int(r.choice([0, 0, 1, 1, 2]))
    # The cords that hold the reeds run down the shade every 10 cm, a little off true.
    step = n // 3
    cords = np.arange(step // 2, n, step) + r.integers(-8, 8, size=3)
    xs = np.arange(n)
    for y0, thick in rows:
        if y0 >= n:
            break
        tone = r.uniform(0.86, 1.1)
        base = srgb('#4a3220') * tone
        # Each reed runs a little thicker and thinner along its length, rounder in the middle than at its edges.
        wobble = 1 + 0.05 * np.sin(2 * np.pi * (xs / n * r.uniform(1, 3) + r.uniform()))
        for dy in range(thick):
            yy = y0 + dy
            if yy >= n:
                break
            s = (dy + 0.5) / thick * 2 - 1
            cover = np.abs(s) < wobble
            shade = (1 - 0.45 * s * s) * (0.94 + 0.12 * r.random(n))
            row = base[None, :] * shade[:, None]
            image[yy, cover] = row[cover]
    for cx in cords:
        for dx in range(-2, 3):
            xx = (cx + dx) % n
            image[:, xx] = image[:, xx] * (0.55 + 0.15 * abs(dx)) + srgb('#2e1e12') * (0.45 - 0.15 * abs(dx))
    Image.fromarray(np.clip(image, 0, 255).astype(np.uint8), 'RGB').save('public/study/weave.jpg', quality=90)


def canvas():
    from PIL import ImageDraw, ImageFilter
    from scipy.spatial import Delaunay

    r = np.random.default_rng(26)
    w, h = 1820, 1320
    greens = ['#86b042', '#6e9d3a', '#a9c64b', '#4f8a3a', '#c2cf5a', '#5f9a48']
    cools = ['#2f6fb5', '#2a8a8a', '#3c8dd0', '#1f5a8a']
    warms = ['#e2b23a', '#d0502a', '#c8a45d', '#e07a2e']
    darks = ['#2a2a2a', '#3b3b2f']
    # Facets: a jittered field of points, finer where the warm cluster sits, low and right of centre.
    points = [(0, 0), (w, 0), (0, h), (w, h)]
    points += [(x, 0) for x in np.linspace(0, w, 9)[1:-1]] + [(x, h) for x in np.linspace(0, w, 9)[1:-1]]
    points += [(0, y) for y in np.linspace(0, h, 7)[1:-1]] + [(w, y) for y in np.linspace(0, h, 7)[1:-1]]
    points += [tuple(p) for p in r.uniform((0, 0), (w, h), size=(150, 2))]
    cluster = np.array([w * 0.58, h * 0.66])
    points += [tuple(cluster + p) for p in r.normal(scale=(w * 0.17, h * 0.12), size=(70, 2))]
    points = np.clip(np.array(points), 0, (w, h))
    tri = Delaunay(points)
    image = Image.new('RGB', (w, h))
    draw = ImageDraw.Draw(image)
    for simplex in tri.simplices:
        corners = points[simplex]
        cx, cy = corners.mean(axis=0)
        near = np.exp(-(((cx - cluster[0]) / (w * 0.2)) ** 2 + ((cy - cluster[1]) / (h * 0.16)) ** 2))
        roll = r.random()
        if cy > h * 0.86:
            pick = darks
        elif roll < 0.62 * near:
            pick = warms if r.random() < 0.5 else cools
        elif roll < 0.07 + 0.05 * (1 - near):
            pick = cools
        else:
            pick = greens
        colour = srgb(pick[int(r.integers(len(pick)))]) * r.uniform(0.86, 1.08)
        draw.polygon([tuple(p) for p in corners], fill=tuple(np.clip(colour, 0, 255).astype(int)))
    # Brush and weave: a little light across each facet and the canvas's tooth under everything.
    pixels = np.asarray(image.filter(ImageFilter.GaussianBlur(0.8))).astype(float)
    yy, xx = np.mgrid[0:h, 0:w]
    tooth = 0.035 * (np.sin(xx * 1.9) * np.sin(yy * 1.9)) + 0.03 * shaped_with(r, (h, w), lambda fx, fy: 1 / (1 + np.hypot(fx, fy) / 60))
    light = 1 + 0.06 * shaped_with(r, (h, w), lambda fx, fy: np.exp(-np.hypot(fx, fy) / 3))
    pixels = pixels * light[..., None] * (1 + tooth[..., None])
    Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8), 'RGB').save('public/study/canvas.jpg', quality=88)


def notebook():
    from PIL import ImageDraw, ImageFilter

    r = np.random.default_rng(3)
    w, h = 1000, 1300
    image = Image.new('RGB', (w, h), (244, 241, 233))
    draw = ImageDraw.Draw(image)
    pitch = 46
    for y in range(150, h - 40, pitch):
        draw.line([(0, y), (w, y)], fill=(176, 194, 214), width=2)
    draw.line([(118, 0), (118, h)], fill=(222, 160, 160), width=2)
    ink = (36, 40, 56)
    for y in range(150, h - 60, pitch):
        if r.random() < 0.12:
            continue
        x = 140 + (r.integers(0, 60) if r.random() < 0.2 else 0)
        end = r.uniform(0.55, 0.95) * w
        while x < end:
            # A word: a run of loops along the line, slanted, its height varying letter to letter.
            length = r.uniform(40, 140)
            t = np.linspace(0, 1, int(length))
            freq = r.uniform(0.07, 0.11)
            heights = 9 + 7 * r.random(len(t))
            px = x + t * length + 6 * np.sin(np.arange(len(t)) * freq * 2 * np.pi)
            py = y - 6 - heights * np.abs(np.sin(np.arange(len(t)) * freq * np.pi)) + 3 * r.normal(size=len(t)).cumsum() / 20
            draw.line(list(zip(px - 0.25 * (py - y), py)), fill=ink, width=2)
            x += length + r.uniform(14, 30)
    image = image.filter(ImageFilter.GaussianBlur(0.6))
    image.save('public/study/notebook.jpg', quality=88)


wood()
weave()
canvas()
notebook()
