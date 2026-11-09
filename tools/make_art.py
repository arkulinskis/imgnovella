"""Draw ImgNovella's built-in starter art pack as SVG files in theme/assets/ (served at _/theme/demo-*.svg).

    python -I tools/make_art.py

Story data refers to them as "demo:<name>" (e.g. demo:bg-cafe, demo:mira-happy). The list the editor
shows is ART in web/pages/_nv_tools.html: keep the two in step when adding art here.
Backgrounds are square (900x900, cropped to the stage), characters 400x600 with transparent corners,
CGs square, covers 600x900 (2:3).
"""
import math
import pathlib
import random

OUT = pathlib.Path(__file__).resolve().parent.parent / "theme" / "assets"
INK = "#2a2238"
SKIN = "#ffe4d4"
SKIN_SHADE = "#f7c9b5"


def svg(w, h, body, defs=""):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">%s%s</svg>\n'
            % (w, h, w, h, ("<defs>%s</defs>" % defs) if defs else "", body))


def grad(gid, stops, x2=0, y2=1):
    return ('<linearGradient id="%s" x1="0" y1="0" x2="%s" y2="%s">' % (gid, x2, y2) +
            "".join('<stop offset="%s" stop-color="%s"/>' % (o, c) for o, c in stops) + "</linearGradient>")


def rgrad(gid, stops):
    return ('<radialGradient id="%s">' % gid + "".join('<stop offset="%s" stop-color="%s"%s/>' % (o, c, (' stop-opacity="%s"' % a) if a is not None else "")
                                                      for o, c, a in stops) + "</radialGradient>")


# ------------------------------------------------------------------------------------------------ backgrounds
def petals(rng, n, color, area=(0, 0, 900, 900), size=(6, 12), opacity=0.85):
    out = []
    x0, y0, x1, y1 = area
    for _ in range(n):
        x, y, s, r = rng.uniform(x0, x1), rng.uniform(y0, y1), rng.uniform(*size), rng.uniform(0, 180)
        out.append('<ellipse cx="%.0f" cy="%.0f" rx="%.1f" ry="%.1f" fill="%s" opacity="%.2f" transform="rotate(%.0f %.0f %.0f)"/>'
                   % (x, y, s, s * 0.6, color, opacity * rng.uniform(.6, 1), r, x, y))
    return "".join(out)


def sakura_tree(rng, x, y, scale, trunk, blossoms):
    s = scale
    out = ['<path d="M%.0f %.0f C%.0f %.0f %.0f %.0f %.0f %.0f L%.0f %.0f C%.0f %.0f %.0f %.0f %.0f %.0f Z" fill="%s"/>' % (
        x - 18 * s, y, x - 10 * s, y - 120 * s, x - 40 * s, y - 200 * s, x - 70 * s, y - 260 * s,
        x - 50 * s, y - 270 * s, x - 10 * s, y - 210 * s, x + 20 * s, y - 120 * s, x + 18 * s, y, trunk)]
    out.append('<path d="M%.0f %.0f C%.0f %.0f %.0f %.0f %.0f %.0f" stroke="%s" stroke-width="%.0f" fill="none" stroke-linecap="round"/>' % (
        x - 5 * s, y - 150 * s, x + 30 * s, y - 200 * s, x + 70 * s, y - 230 * s, x + 110 * s, y - 250 * s, trunk, 12 * s))
    for _ in range(26):
        bx, by = x + rng.uniform(-170, 170) * s, y - rng.uniform(200, 340) * s
        r = rng.uniform(40, 75) * s
        out.append('<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s"/>' % (bx, by, r, rng.choice(blossoms)))
    return "".join(out)


def bg_sakura(night=False):
    rng = random.Random(7 if night else 3)
    sky = [("0", "#24204f"), ("0.6", "#4a3a7a"), ("1", "#8a5a8f")] if night else [("0", "#9fd8f2"), ("0.65", "#ffe0ea"), ("1", "#fff3e6")]
    blos = ["#c76c9a", "#b85b8c", "#d985ad"] if night else ["#ffb3cc", "#ff9fbe", "#ffc7d9", "#ff8fb3"]
    trunk = "#3b2740" if night else "#7a4a52"
    grass = "#3d4a6b" if night else "#a8e0b0"
    path_c = "#5a5480" if night else "#f4dcc0"
    defs = grad("sky", sky) + rgrad("glow", [("0", "#fff6c9", "0.9"), ("1", "#fff6c9", "0")])
    b = ['<rect width="900" height="900" fill="url(#sky)"/>']
    if night:
        for _ in range(60):
            b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#fff" opacity="%.2f"/>' % (rng.uniform(0, 900), rng.uniform(0, 420), rng.uniform(.8, 2.4), rng.uniform(.4, 1)))
        b.append('<circle cx="690" cy="170" r="120" fill="url(#glow)"/><circle cx="690" cy="170" r="52" fill="#fff4cf"/>')
    else:
        b.append('<circle cx="700" cy="160" r="150" fill="#fff8d6" opacity=".55"/>')
        for cx, cy in ((180, 140), (520, 90)):
            b.append('<g fill="#fff" opacity=".9"><ellipse cx="%d" cy="%d" rx="80" ry="26"/><ellipse cx="%d" cy="%d" rx="46" ry="34"/><ellipse cx="%d" cy="%d" rx="36" ry="24"/></g>' % (cx, cy, cx - 20, cy - 18, cx + 34, cy - 10))
    b.append('<path d="M0 560 C150 500 300 530 450 510 C620 485 760 520 900 500 L900 900 L0 900Z" fill="%s" opacity=".55"/>' % ("#4b4a7d" if night else "#c6e9c9"))
    b.append('<path d="M0 620 C200 590 420 610 900 585 L900 900 L0 900Z" fill="%s"/>' % grass)
    b.append('<path d="M380 900 C420 760 470 680 520 610 L560 610 C560 690 600 780 700 900Z" fill="%s"/>' % path_c)
    b.append(sakura_tree(rng, 160, 700, 1.15, trunk, blos))
    b.append(sakura_tree(rng, 790, 680, 1.0, trunk, blos))
    b.append(sakura_tree(rng, 470, 600, 0.55, trunk, blos))
    # bench
    bc = "#6b4a5a" if night else "#b9775f"
    b.append('<g fill="%s"><rect x="600" y="700" width="170" height="14" rx="5"/><rect x="600" y="672" width="170" height="12" rx="5"/><rect x="612" y="714" width="10" height="44"/><rect x="748" y="714" width="10" height="44"/></g>' % bc)
    if night:
        for lx in (300, 640):
            b.append('<rect x="%d" y="520" width="6" height="140" fill="#2a2238"/><circle cx="%d" cy="515" r="40" fill="url(#glow)"/><rect x="%d" y="500" width="22" height="28" rx="6" fill="#ffd27a"/>' % (lx, lx + 3, lx - 8))
    b.append(petals(rng, 70, "#ffc2d6" if not night else "#e7a3c7"))
    return svg(900, 900, "".join(b), defs)


def bg_classroom():
    defs = grad("wall", [("0", "#fff1e0"), ("1", "#ffe2cf")]) + grad("sky", [("0", "#8fd3f5"), ("1", "#d9f1ff")])
    b = ['<rect width="900" height="900" fill="url(#wall)"/>', '<rect y="640" width="900" height="260" fill="#d9a77f"/>',
         '<g stroke="#c48f68" stroke-width="3">' + "".join('<line x1="0" y1="%d" x2="900" y2="%d"/>' % (y, y) for y in (690, 750, 820)) + "</g>"]
    for wx in (40, 330, 620):
        b.append('<rect x="%d" y="120" width="240" height="330" rx="8" fill="url(#sky)" stroke="#f3f3f3" stroke-width="14"/>' % wx)
        b.append('<line x1="%d" y1="120" x2="%d" y2="450" stroke="#f3f3f3" stroke-width="10"/><line x1="%d" y1="285" x2="%d" y2="285" stroke="#f3f3f3" stroke-width="10"/>' % (wx + 120, wx + 120, wx, wx + 240))
        b.append('<ellipse cx="%d" cy="380" rx="60" ry="40" fill="#ffb3cc" opacity=".9"/><ellipse cx="%d" cy="400" rx="50" ry="30" fill="#ff9fbe"/>' % (wx + 60, wx + 170))
        b.append('<rect x="%d" y="110" width="40" height="350" fill="#ff9fbe" opacity=".55"/>' % (wx - 26))
    for dx, dy, s in ((90, 640, 1.0), (520, 640, 1.0), (300, 720, 1.2), (740, 730, 1.2)):
        b.append('<g transform="translate(%d %d) scale(%s)"><rect x="0" y="0" width="170" height="20" rx="4" fill="#c98b5e"/><rect x="10" y="20" width="10" height="90" fill="#8d8d9a"/><rect x="150" y="20" width="10" height="90" fill="#8d8d9a"/><rect x="20" y="40" width="130" height="40" fill="#b07a52"/></g>' % (dx, dy, s))
    return svg(900, 900, "".join(b), defs)


def bg_cafe():
    rng = random.Random(11)
    defs = grad("wall", [("0", "#5a3a3f"), ("1", "#7c5048")]) + rgrad("lamp", [("0", "#ffe3a3", "0.9"), ("1", "#ffe3a3", "0")]) + grad("win", [("0", "#ffb38a"), ("1", "#ffd9c2")])
    b = ['<rect width="900" height="900" fill="url(#wall)"/>',
         '<rect x="80" y="150" width="330" height="380" rx="160" fill="url(#win)" stroke="#3a2428" stroke-width="16"/>',
         '<line x1="245" y1="150" x2="245" y2="530" stroke="#3a2428" stroke-width="10"/>',
         '<path d="M90 470 C160 420 230 460 300 430 C350 410 380 430 400 440 L400 530 L90 530Z" fill="#ff9fbe" opacity=".7"/>',
         '<rect y="600" width="900" height="300" fill="#3a2428"/>', '<rect x="0" y="560" width="900" height="60" rx="8" fill="#c98b5e"/>',
         '<rect x="0" y="615" width="900" height="16" fill="#9a6345"/>']
    for sx in (480, 600, 720):
        b.append('<rect x="%d" y="170" width="100" height="10" fill="#9a6345"/>' % sx)
        for i in range(4):
            b.append('<rect x="%d" y="%d" width="18" height="34" rx="4" fill="%s"/>' % (sx + 6 + i * 24, 136, rng.choice(["#ffb3cc", "#3cc6c0", "#ffd24a", "#f4f1ea"])))
        b.append('<rect x="%d" y="300" width="100" height="10" fill="#9a6345"/>' % sx)
        b.append('<circle cx="%d" cy="282" r="18" fill="#3cc6c0"/><rect x="%d" y="280" width="20" height="20" fill="#f4f1ea"/>' % (sx + 30, sx + 60))
    for lx in (200, 460, 720):
        b.append('<line x1="%d" y1="0" x2="%d" y2="80" stroke="#2a1a1d" stroke-width="4"/><circle cx="%d" cy="130" r="110" fill="url(#lamp)"/><path d="M%d 80 L%d 80 L%d 120 L%d 120Z" fill="#ffd24a"/>' % (lx, lx, lx, lx - 20, lx + 20, lx + 36, lx - 36))
    b.append('<g><rect x="560" y="500" width="70" height="60" rx="8" fill="#f4f1ea"/><path d="M630 512 C660 512 660 548 630 548" stroke="#f4f1ea" stroke-width="8" fill="none"/><path d="M580 480 C570 460 595 450 585 430 M605 480 C595 460 620 450 610 430" stroke="#f4f1ea" stroke-width="4" fill="none" opacity=".6"/></g>')
    b.append('<path d="M760 560 C750 470 800 430 820 400 C840 440 880 470 860 560Z" fill="#4c9a73"/><rect x="785" y="530" width="60" height="40" rx="6" fill="#ff9fbe"/>')
    return svg(900, 900, "".join(b), defs)


def bg_station(dawn=False):
    rng = random.Random(5)
    sky = [("0", "#7a5fa8"), ("0.45", "#ff9fb3"), ("1", "#ffd8a8")] if dawn else [("0", "#121633"), ("0.7", "#2b2f63"), ("1", "#4b3d78")]
    defs = grad("sky", sky) + rgrad("lamp", [("0", "#fff1b8", "0.85"), ("1", "#fff1b8", "0")]) + grad("plat", [("0", "#5b5a7d"), ("1", "#2f2d48")])
    b = ['<rect width="900" height="900" fill="url(#sky)"/>']
    for _ in range(80):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#fff" opacity="%.2f"/>' % (rng.uniform(0, 900), rng.uniform(0, 380), rng.uniform(.6, 2), rng.uniform(.3, 1) * (.25 if dawn else 1)))
    if dawn:
        b.append('<circle cx="760" cy="430" r="150" fill="#fff3c4" opacity=".55"/><circle cx="760" cy="430" r="70" fill="#fff6d6"/>')
    b.append('<path d="M0 470 L60 470 L60 400 L120 400 L120 440 L190 440 L190 360 L240 360 L240 470 L330 470 L330 420 L400 420 L400 470 L900 470 L900 520 L0 520Z" fill="#1b1a33"/>')
    for _ in range(26):
        b.append('<rect x="%.0f" y="%.0f" width="8" height="10" fill="#ffd27a" opacity="%.2f"/>' % (rng.uniform(60, 390), rng.uniform(370, 460), rng.uniform(.4, .9)))
    # train
    b.append('<rect x="-20" y="420" width="640" height="230" rx="30" fill="#e8e6f2"/><rect x="-20" y="600" width="640" height="18" fill="#ff4f8b"/>')
    for i in range(5):
        b.append('<rect x="%d" y="455" width="90" height="100" rx="12" fill="#ffe7a8"/><rect x="%d" y="455" width="90" height="100" rx="12" fill="#ffd27a" opacity=".5"/>' % (10 + i * 118, 10 + i * 118))
    b.append('<rect y="650" width="900" height="250" fill="url(#plat)"/><rect y="650" width="900" height="14" fill="#ffd24a"/>')
    b.append('<rect x="660" y="180" width="12" height="470" fill="#20203a"/><rect x="600" y="210" width="190" height="60" rx="10" fill="#2a2a4f" stroke="#8a87c9" stroke-width="3"/><rect x="618" y="232" width="120" height="14" rx="7" fill="#8fe3df"/>')
    for lx in (120, 820):
        b.append('<circle cx="%d" cy="300" r="120" fill="url(#lamp)"/><rect x="%d" y="300" width="10" height="350" fill="#20203a"/><rect x="%d" y="286" width="44" height="20" rx="8" fill="#fff1b8"/>' % (lx, lx - 5, lx - 22))
    for _ in range(0 if dawn else 90):
        x, y = rng.uniform(0, 900), rng.uniform(0, 900)
        b.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#c7d3ff" stroke-width="1.6" opacity=".35"/>' % (x, y, x - 8, y + 34))
    return svg(900, 900, "".join(b), defs)


def bg_rooftop():
    rng = random.Random(9)
    defs = grad("sky", [("0", "#5b4b9a"), ("0.45", "#ff7fa6"), ("0.8", "#ffb38a"), ("1", "#ffd59a")])
    b = ['<rect width="900" height="900" fill="url(#sky)"/>', '<circle cx="450" cy="560" r="110" fill="#fff0b3" opacity=".9"/>']
    x = 0
    while x < 900:
        w, h = rng.randint(50, 110), rng.randint(80, 260)
        b.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#6b4a7d"/>' % (x, 600 - h, w, h + 10))
        for _ in range(rng.randint(2, 6)):
            b.append('<rect x="%d" y="%d" width="6" height="8" fill="#ffd27a" opacity=".8"/>' % (x + rng.randint(6, w - 12), 600 - h + rng.randint(10, h - 10)))
        x += w + rng.randint(0, 8)
    b.append('<rect y="600" width="900" height="300" fill="#8a7a96"/><rect y="600" width="900" height="10" fill="#6d5f7a"/>')
    b.append('<g stroke="#3a2f4d" stroke-width="5">' + "".join('<line x1="%d" y1="470" x2="%d" y2="640"/>' % (i, i) for i in range(0, 901, 36)) +
             '<line x1="0" y1="470" x2="900" y2="470"/><line x1="0" y1="560" x2="900" y2="560"/></g>')
    b.append('<g transform="translate(690 300)"><rect x="0" y="0" width="140" height="150" rx="16" fill="#5a4a6f"/><rect x="10" y="150" width="12" height="190" fill="#3a2f4d"/><rect x="118" y="150" width="12" height="190" fill="#3a2f4d"/></g>')
    for _ in range(4):
        cx = rng.randint(100, 800)
        b.append('<path d="M%d 200 q15 -12 30 0 q15 -12 30 0" stroke="#3a2f4d" stroke-width="4" fill="none"/>' % cx)
    return svg(900, 900, "".join(b), defs)


def bg_library():
    rng = random.Random(21)
    defs = grad("wall", [("0", "#2c3a5a"), ("1", "#3a2f4d")]) + rgrad("lamp", [("0", "#ffd98a", "0.85"), ("1", "#ffd98a", "0")]) + grad("win", [("0", "#5a6fa8"), ("1", "#8fa3d6")])
    b = ['<rect width="900" height="900" fill="url(#wall)"/>']
    cols = ["#ff7fa6", "#3cc6c0", "#ffd24a", "#8a7ad6", "#f4f1ea", "#e5735e", "#6cc08a"]
    for sx in (0, 600):
        for row in range(6):
            y = 90 + row * 120
            b.append('<rect x="%d" y="%d" width="300" height="14" fill="#6b4a3f"/>' % (sx, y + 96))
            x = sx + 10
            while x < sx + 280:
                w, h = rng.randint(14, 28), rng.randint(62, 92)
                b.append('<rect x="%d" y="%d" width="%d" height="%d" rx="3" fill="%s"/>' % (x, y + 96 - h, w, h, rng.choice(cols)))
                x += w + 3
    b.append('<rect x="340" y="120" width="220" height="360" rx="110" fill="url(#win)" stroke="#6b4a3f" stroke-width="14"/>')
    for _ in range(40):
        x, y = rng.uniform(350, 550), rng.uniform(140, 470)
        b.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#e3ecff" stroke-width="2" opacity=".5"/>' % (x, y, x - 5, y + 22))
    b.append('<rect y="720" width="900" height="180" fill="#4a3530"/><rect x="250" y="600" width="400" height="26" rx="6" fill="#8a5a43"/><rect x="280" y="626" width="16" height="140" fill="#6b4a3f"/><rect x="604" y="626" width="16" height="140" fill="#6b4a3f"/>')
    b.append('<circle cx="560" cy="560" r="160" fill="url(#lamp)"/><path d="M530 520 L590 520 L600 560 L520 560Z" fill="#3cc6c0"/><rect x="556" y="560" width="8" height="40" fill="#2a2238"/>')
    b.append('<path d="M330 598 L420 586 L420 600 L330 600Z" fill="#f4f1ea"/><path d="M420 586 L510 598 L510 600 L420 600Z" fill="#e9e3d6"/>')
    for _ in range(26):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#ffe7a8" opacity="%.2f"/>' % (rng.uniform(200, 760), rng.uniform(380, 700), rng.uniform(1.2, 3.2), rng.uniform(.3, .9)))
    return svg(900, 900, "".join(b), defs)


def bg_bedroom():
    rng = random.Random(4)
    defs = grad("wall", [("0", "#3d3566"), ("1", "#574578")]) + grad("night", [("0", "#121633"), ("1", "#2f3a73")]) + rgrad("lamp", [("0", "#ffd98a", "0.8"), ("1", "#ffd98a", "0")])
    b = ['<rect width="900" height="900" fill="url(#wall)"/>', '<rect x="470" y="130" width="330" height="300" rx="14" fill="url(#night)" stroke="#e9e3f6" stroke-width="12"/>']
    for _ in range(30):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#fff" opacity="%.2f"/>' % (rng.uniform(480, 790), rng.uniform(140, 420), rng.uniform(.8, 2), rng.uniform(.4, 1)))
    b.append('<circle cx="720" cy="210" r="34" fill="#fff4cf"/><circle cx="706" cy="200" r="30" fill="#121633"/>')
    b.append('<path d="M450 120 C470 260 440 360 470 450 L430 450 C410 330 440 230 420 120Z" fill="#ff9fbe"/><path d="M820 120 C800 260 830 360 800 450 L840 450 C860 330 830 230 850 120Z" fill="#ff9fbe"/>')
    b.append('<rect y="660" width="900" height="240" fill="#2f2748"/>')
    b.append('<rect x="40" y="520" width="420" height="190" rx="24" fill="#f4f1ea"/><rect x="40" y="580" width="420" height="140" rx="20" fill="#3cc6c0"/><rect x="70" y="530" width="130" height="60" rx="26" fill="#fff"/><rect x="30" y="460" width="24" height="270" rx="10" fill="#8a5a43"/>')
    b.append('<circle cx="600" cy="560" r="150" fill="url(#lamp)"/><rect x="540" y="600" width="200" height="16" rx="5" fill="#8a5a43"/><rect x="560" y="616" width="10" height="100" fill="#6b4a3f"/><rect x="710" y="616" width="10" height="100" fill="#6b4a3f"/>')
    b.append('<path d="M585 540 L625 540 L640 580 L570 580Z" fill="#ffd24a"/><rect x="600" y="580" width="8" height="20" fill="#2a2238"/>')
    b.append('<g fill="#ffd24a" opacity=".85">' + "".join('<path d="M%d %d l4 9 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1z"/>' % (rng.randint(60, 420), rng.randint(60, 420)) for _ in range(9)) + "</g>")
    return svg(900, 900, "".join(b), defs)


def bg_festival():
    rng = random.Random(31)
    defs = grad("sky", [("0", "#141235"), ("0.6", "#33285e"), ("1", "#5a3a6e")]) + rgrad("glow", [("0", "#ffcf7a", "0.8"), ("1", "#ffcf7a", "0")])
    b = ['<rect width="900" height="900" fill="url(#sky)"/>']
    for _ in range(50):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#fff" opacity="%.2f"/>' % (rng.uniform(0, 900), rng.uniform(0, 360), rng.uniform(.6, 1.8), rng.uniform(.3, .9)))
    for cx, cy, r, col in ((210, 150, 95, "#ff7fa6"), (640, 110, 120, "#ffd24a"), (470, 230, 70, "#8fe3df")):
        for i in range(24):
            a = i * math.pi * 2 / 24
            b.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="%s" stroke-width="4" stroke-linecap="round" opacity=".85"/>'
                     % (cx + math.cos(a) * r * .35, cy + math.sin(a) * r * .35, cx + math.cos(a) * r, cy + math.sin(a) * r, col))
            b.append('<circle cx="%.0f" cy="%.0f" r="4" fill="%s"/>' % (cx + math.cos(a) * r * 1.08, cy + math.sin(a) * r * 1.08, col))
    # strings of lanterns
    for y0, sag in ((300, 50), (380, 40)):
        b.append('<path d="M0 %d Q450 %d 900 %d" stroke="#2a1f3d" stroke-width="3" fill="none"/>' % (y0, y0 + sag * 2, y0))
        for i in range(10):
            t = (i + .5) / 10
            x = 900 * t
            y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * (y0 + sag * 2) + t * t * y0
            col = ("#ff4f5e", "#ff9a3c", "#ffd24a")[i % 3]
            b.append('<circle cx="%.0f" cy="%.0f" r="34" fill="url(#glow)"/><ellipse cx="%.0f" cy="%.0f" rx="17" ry="22" fill="%s" stroke="#2a1f3d" stroke-width="3"/>'
                     '<rect x="%.0f" y="%.0f" width="14" height="6" fill="#2a1f3d"/><line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#2a1f3d" stroke-width="2" opacity=".5"/>'
                     % (x, y + 22, x, y + 22, col, x - 7, y - 2, x - 15, y + 22, x + 15, y + 22))
    b.append('<rect y="600" width="900" height="300" fill="#3a2c4a"/><rect y="600" width="900" height="12" fill="#2a1f3d"/>')
    for sx, c1 in ((20, "#ff4f5e"), (330, "#3cc6c0"), (640, "#ff9a3c")):
        b.append('<rect x="%d" y="470" width="250" height="150" fill="#5a3a3f"/>' % sx)
        for i in range(10):
            b.append('<path d="M%d 440 L%d 440 L%d 490 L%d 490Z" fill="%s"/>' % (sx - 10 + i * 27, sx + 17 + i * 27, sx + 17 + i * 27, sx - 10 + i * 27, c1 if i % 2 == 0 else "#fff4e6"))
        b.append('<path d="M%d 490 q13.5 14 27 0" fill="%s"/>' % (sx - 10, c1) + "".join('<path d="M%d 490 q13.5 14 27 0" fill="%s"/>' % (sx - 10 + i * 27, c1 if i % 2 == 0 else "#fff4e6") for i in range(1, 10)))
        b.append('<rect x="%d" y="560" width="270" height="34" rx="6" fill="#c98b5e"/><circle cx="%d" cy="540" r="70" fill="url(#glow)"/>' % (sx - 10, sx + 125))
        for i in range(5):
            b.append('<circle cx="%d" cy="548" r="11" fill="%s" stroke="#2a1f3d" stroke-width="2"/>' % (sx + 30 + i * 46, rng.choice(["#ffd24a", "#ff7fa6", "#8fe3df", "#fff4e6"])))
    for _ in range(14):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.0f" fill="#ffd27a" opacity=".25"/>' % (rng.uniform(0, 900), rng.uniform(620, 900), rng.uniform(10, 30)))
    return svg(900, 900, "".join(b), defs)


def bg_shrine():
    rng = random.Random(17)
    defs = grad("sky", [("0", "#2b2350"), ("0.5", "#8a4d7a"), ("1", "#ff9f7a")]) + rgrad("glow", [("0", "#fff6c9", "0.9"), ("1", "#fff6c9", "0")])
    b = ['<rect width="900" height="900" fill="url(#sky)"/>', '<circle cx="660" cy="170" r="110" fill="url(#glow)"/><circle cx="660" cy="170" r="46" fill="#fff4cf"/>']
    for layer, col, base in ((0, "#4a2f5a", 520), (1, "#2f2240", 590)):
        x = -40
        while x < 940:
            w, h = rng.randint(70, 130), rng.randint(160, 300) - layer * 40
            b.append('<path d="M%d %d L%d %d L%d %d Z" fill="%s"/>' % (x, base + 60, x + w / 2, base - h, x + w, base + 60, col))
            x += int(w * .6)
    b.append('<rect y="640" width="900" height="260" fill="#241a33"/>')
    # stone steps
    for i in range(7):
        w = 220 + i * 70
        b.append('<rect x="%d" y="%d" width="%d" height="38" fill="%s" stroke="#1a1326" stroke-width="3"/>' % (450 - w / 2, 640 + i * 38, w, "#8d86a3" if i % 2 else "#a39cb8"))
    # torii
    t = "#e5484d"
    b.append('<rect x="290" y="300" width="34" height="340" fill="%s" stroke="#1a1326" stroke-width="4"/><rect x="576" y="300" width="34" height="340" fill="%s" stroke="#1a1326" stroke-width="4"/>' % (t, t))
    b.append('<rect x="262" y="350" width="376" height="26" fill="%s" stroke="#1a1326" stroke-width="4"/>' % t)
    b.append('<path d="M226 282 Q450 300 674 282 L664 316 Q450 330 236 316Z" fill="#2a1f2d" stroke="#1a1326" stroke-width="4"/><rect x="250" y="314" width="400" height="20" fill="%s" stroke="#1a1326" stroke-width="4"/>' % t)
    b.append('<rect x="430" y="334" width="40" height="40" fill="#2a1f2d"/><rect x="438" y="342" width="24" height="24" fill="#ffd24a"/>')
    # stone lanterns
    for lx in (150, 750):
        b.append('<g fill="#9a93ae" stroke="#1a1326" stroke-width="3"><rect x="%d" y="600" width="70" height="20"/><rect x="%d" y="520" width="30" height="80"/>'
                 '<rect x="%d" y="470" width="60" height="50" rx="6"/><path d="M%d 470 L%d 440 L%d 440 L%d 470Z"/></g>'
                 '<rect x="%d" y="482" width="30" height="26" fill="#ffd27a"/><circle cx="%d" cy="495" r="60" fill="url(#glow)" opacity=".6"/>'
                 % (lx - 35, lx - 15, lx - 30, lx - 44, lx - 20, lx + 20, lx + 44, lx - 15, lx))
    for _ in range(40):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#e9ff9a" opacity="%.2f"/>' % (rng.uniform(0, 900), rng.uniform(380, 860), rng.uniform(1.5, 3.5), rng.uniform(.4, .95)))
    b.append(petals(rng, 18, "#ffb38a", area=(0, 300, 900, 900), size=(5, 9), opacity=.7))
    return svg(900, 900, "".join(b), defs)


def bg_beach():
    rng = random.Random(23)
    defs = grad("sky", [("0", "#6a5aa8"), ("0.45", "#ff8fa6"), ("0.75", "#ffc38a"), ("1", "#ffe0a8")]) + grad("sea", [("0", "#3a7fb0"), ("1", "#2a5a8a")])
    b = ['<rect width="900" height="900" fill="url(#sky)"/>', '<circle cx="450" cy="500" r="120" fill="#fff0b3"/>',
         '<rect y="500" width="900" height="200" fill="url(#sea)"/>']
    for _ in range(40):
        x, y = rng.uniform(0, 900), rng.uniform(510, 690)
        b.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#ffe7b8" stroke-width="3" stroke-linecap="round" opacity="%.2f"/>' % (x, y, x + rng.uniform(20, 60), y, rng.uniform(.3, .8)))
    b.append('<rect x="380" y="505" width="140" height="190" fill="#ffe7b8" opacity=".25"/>')
    for cx, cy in ((150, 160), (690, 120)):
        b.append('<g fill="#fff" opacity=".75"><ellipse cx="%d" cy="%d" rx="90" ry="22"/><ellipse cx="%d" cy="%d" rx="50" ry="28"/></g>' % (cx, cy, cx + 20, cy - 14))
    b.append('<path d="M0 690 C150 670 300 700 450 680 C600 662 760 696 900 676 L900 900 L0 900Z" fill="#f4dcb0"/>')
    b.append('<path d="M0 690 C150 670 300 700 450 680 C600 662 760 696 900 676" stroke="#fff" stroke-width="10" fill="none" opacity=".8"/>')
    # umbrella + towel
    b.append('<rect x="684" y="560" width="8" height="250" fill="#6b4a3f" transform="rotate(8 688 680)"/>')
    b.append('<path d="M560 590 Q690 470 820 590Z" fill="#ff4f8b" stroke="#2a2238" stroke-width="4"/><path d="M630 590 Q690 500 750 590Z" fill="#fff4e6"/>')
    b.append('<rect x="520" y="780" width="240" height="70" rx="10" fill="#3cc6c0" transform="rotate(-6 640 815)"/><rect x="540" y="780" width="20" height="70" fill="#fff4e6" transform="rotate(-6 640 815)"/>')
    # palm
    b.append('<path d="M120 900 C110 780 130 640 170 520 L186 524 C150 640 136 780 150 900Z" fill="#7a5a43"/>')
    for a in (-150, -110, -60, -20, 20):
        b.append('<path d="M178 520 Q%.0f %.0f %.0f %.0f" stroke="#3a8a5c" stroke-width="22" fill="none" stroke-linecap="round"/>'
                 % (178 + math.cos(math.radians(a)) * 80, 500 + math.sin(math.radians(a)) * 80 - 30, 178 + math.cos(math.radians(a)) * 160, 520 + math.sin(math.radians(a)) * 120 + 40))
    for _ in range(8):
        x, y = rng.uniform(250, 880), rng.uniform(720, 880)
        b.append('<path d="M%.0f %.0f l10 -16 l10 16z" fill="#ffb3cc" stroke="#2a2238" stroke-width="2"/>' % (x, y))
    return svg(900, 900, "".join(b), defs)


def bg_spaceship():
    rng = random.Random(41)
    defs = grad("wall", [("0", "#1b2036"), ("1", "#2b3152")]) + grad("space", [("0", "#070a1e"), ("1", "#1c1450")]) + rgrad("glow", [("0", "#8fe3df", "0.7"), ("1", "#8fe3df", "0")])
    b = ['<rect width="900" height="900" fill="url(#wall)"/>',
         '<rect x="110" y="110" width="680" height="400" rx="60" fill="url(#space)" stroke="#8a93b8" stroke-width="16"/>']
    for _ in range(90):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#fff" opacity="%.2f"/>' % (rng.uniform(130, 770), rng.uniform(130, 490), rng.uniform(.5, 2), rng.uniform(.3, 1)))
    b.append('<circle cx="560" cy="330" r="110" fill="#ff8f6b"/><path d="M470 300 Q560 270 650 300 Q560 330 470 300" fill="#ffb38a" opacity=".6"/><path d="M500 380 Q560 360 640 380" stroke="#e5604d" stroke-width="14" fill="none" opacity=".5"/>')
    b.append('<ellipse cx="560" cy="330" rx="190" ry="34" fill="none" stroke="#ffd24a" stroke-width="8" opacity=".8" transform="rotate(-14 560 330)"/>')
    b.append('<circle cx="250" cy="220" r="30" fill="#8fe3df" opacity=".85"/>')
    b.append('<line x1="450" y1="110" x2="450" y2="510" stroke="#8a93b8" stroke-width="10"/>')
    b.append('<rect x="0" y="40" width="900" height="16" fill="#8fe3df" opacity=".5"/><rect y="0" width="900" height="40" fill="#141829"/>')
    b.append('<rect y="600" width="900" height="300" fill="#141829"/><path d="M0 600 L900 600 L860 650 L40 650Z" fill="#3a4170"/>')
    for i in range(3):
        x = 70 + i * 270
        b.append('<rect x="%d" y="660" width="220" height="110" rx="14" fill="#262c4a" stroke="#8a93b8" stroke-width="4"/><circle cx="%d" cy="715" r="70" fill="url(#glow)"/>' % (x, x + 110))
        for j in range(5):
            b.append('<circle cx="%d" cy="%d" r="9" fill="%s"/>' % (x + 30 + j * 40, 700 + (j % 2) * 30, rng.choice(["#ff4f8b", "#8fe3df", "#ffd24a", "#6cc08a"])))
    for x in (40, 860):
        b.append('<rect x="%d" y="100" width="12" height="500" fill="#3a4170"/>' % (x - 6))
    return svg(900, 900, "".join(b), defs)


# ------------------------------------------------------------------------------------------------ characters
CHARS = {
    "mira": {"hair": "#ff8fb8", "hair_dark": "#e0608f", "eyes": "#26a7a1", "outfit": "#fff3df", "outfit2": "#ff8fb8", "style": "bob", "acc": "ribbon"},
    "ren": {"hair": "#3a3f7a", "hair_dark": "#262a59", "eyes": "#d99a2b", "outfit": "#33365e", "outfit2": "#f4f1ea", "style": "spiky", "acc": "glasses"},
    "sol": {"hair": "#ff9a3c", "hair_dark": "#e07418", "eyes": "#3aa35c", "outfit": "#7fdcd5", "outfit2": "#ffffff", "style": "ponytail", "acc": "clip"},
    "hana": {"hair": "#4a2f6b", "hair_dark": "#2e1c47", "eyes": "#e0a020", "outfit": "#2f3a6b", "outfit2": "#e5484d", "style": "long", "acc": "flower"},
}
EXPRESSIONS = ["neutral", "happy", "sad", "surprised", "angry", "shy"]


def eye(cx, cy, iris, expr, side):
    """One eye at (cx, cy). side -1 = left eye, 1 = right."""
    if expr == "happy":
        return '<path d="M%d %d Q%d %d %d %d" stroke="%s" stroke-width="6" fill="none" stroke-linecap="round"/>' % (cx - 20, cy + 6, cx, cy - 18, cx + 20, cy + 6, INK)
    big = expr == "surprised"
    rx, ry = (21, 26) if big else (19, 23)
    look = 6 * side * 0 + (-7 if expr == "shy" else 0)
    ir_r = (11, 14) if big else (14, 18)
    out = ['<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#fff" stroke="%s" stroke-width="3"/>' % (cx, cy, rx, ry, INK),
           '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s"/>' % (cx + look, cy + 3, ir_r[0], ir_r[1], iris),
           '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s"/>' % (cx + look, cy + 5, ir_r[0] - 7, ir_r[1] - 8, INK),
           '<circle cx="%d" cy="%d" r="5" fill="#fff"/><circle cx="%d" cy="%d" r="2.5" fill="#fff"/>' % (cx + look - 5, cy - 4, cx + look + 6, cy + 10)]
    # upper lash line
    lid = cy - ry + (7 if expr in ("angry", "sad") else 2)
    out.append('<path d="M%d %d Q%d %d %d %d" stroke="%s" stroke-width="6.5" fill="none" stroke-linecap="round"/>' % (cx - rx - 2, cy - 2, cx, lid - 10, cx + rx + 2, cy - 2, INK))
    if expr == "angry":  # heavy lid
        out.append('<path d="M%d %d L%d %d" stroke="%s" stroke-width="6" stroke-linecap="round"/>' % (cx - rx, cy - 10 + (6 if side > 0 else -2), cx + rx, cy - 10 + (-2 if side > 0 else 6), INK))
    return "".join(out)


def brows(expr, color):
    if expr == "angry":
        pts = ((140, 196, 180, 212), (260, 196, 220, 212))
    elif expr == "sad":
        pts = ((140, 210, 180, 196), (260, 210, 220, 196))
    elif expr == "surprised":
        pts = ((140, 186, 180, 180), (260, 186, 220, 180))
    else:
        pts = ((140, 202, 180, 198), (260, 202, 220, 198))
    return "".join('<path d="M%d %d L%d %d" stroke="%s" stroke-width="7" stroke-linecap="round"/>' % (a, b_, c, d, color) for a, b_, c, d in pts)


def mouth(expr):
    if expr == "happy":
        return '<path d="M178 300 Q200 334 222 300 Z" fill="#c2405f" stroke="%s" stroke-width="3.5" stroke-linejoin="round"/><path d="M188 314 Q200 326 212 314" fill="#ff8fa8"/>' % INK
    if expr == "sad":
        return '<path d="M186 314 Q200 302 214 314" stroke="%s" stroke-width="4" fill="none" stroke-linecap="round"/>' % INK
    if expr == "surprised":
        return '<ellipse cx="200" cy="310" rx="10" ry="13" fill="#c2405f" stroke="%s" stroke-width="3.5"/>' % INK
    if expr == "angry":
        return '<path d="M184 312 L193 306 L200 312 L207 306 L216 312" stroke="%s" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' % INK
    if expr == "shy":
        return '<path d="M188 308 Q194 302 200 308 Q206 314 212 308" stroke="%s" stroke-width="3.5" fill="none" stroke-linecap="round"/>' % INK
    return '<path d="M188 304 Q200 314 212 304" stroke="%s" stroke-width="4" fill="none" stroke-linecap="round"/>' % INK


def hair_back(c):
    h, s = c["hair"], c["style"]
    if s == "bob":
        return '<path d="M92 240 C80 120 160 70 200 70 C240 70 320 120 308 240 C312 300 300 350 280 372 L120 372 C100 350 88 300 92 240Z" fill="%s" stroke="%s" stroke-width="4"/>' % (h, INK)
    if s == "spiky":
        return '<path d="M100 230 C90 130 150 80 200 78 C260 80 316 130 300 230 L292 280 L108 280Z" fill="%s" stroke="%s" stroke-width="4"/>' % (h, INK)
    if s == "long":
        return '<path d="M92 240 C80 120 160 70 200 70 C240 70 320 120 308 240 C316 360 334 470 326 560 L74 560 C66 470 84 360 92 240Z" fill="%s" stroke="%s" stroke-width="4"/>' % (h, INK)
    # ponytail: tail swinging out to the right
    return ('<path d="M290 150 C360 150 380 240 360 330 C350 380 330 420 300 450 C320 390 320 320 290 270Z" fill="%s" stroke="%s" stroke-width="4"/>' % (h, INK) +
            '<path d="M98 240 C86 130 160 74 200 74 C250 74 316 130 302 240 L296 300 L104 300Z" fill="%s" stroke="%s" stroke-width="4"/>' % (h, INK))


def hair_front(c):
    h, d, s = c["hair"], c["hair_dark"], c["style"]
    if s == "bob":
        bangs = ('<path d="M100 236 C96 140 160 96 200 96 C246 96 306 140 300 236 L284 236 L270 182 L258 228 L238 168 L222 222 L200 160 L184 220 L162 170 L148 226 L132 186 L118 236Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>' % (h, INK) +
                 '<path d="M100 236 C96 280 104 330 118 360 L136 360 C128 320 124 270 128 236Z" fill="%s" stroke="%s" stroke-width="4"/>' % (h, INK) +
                 '<path d="M300 236 C304 280 296 330 282 360 L264 360 C272 320 276 270 272 236Z" fill="%s" stroke="%s" stroke-width="4"/>' % (h, INK) +
                 '<path d="M150 120 Q190 104 230 112" stroke="#fff" stroke-width="7" opacity=".5" fill="none" stroke-linecap="round"/>')
        return bangs
    if s == "spiky":
        return ('<path d="M100 236 C92 130 150 88 200 88 C254 88 312 130 300 236 L290 220 L276 236 L262 180 L246 226 L228 160 L212 214 L196 150 L178 212 L160 166 L146 224 L128 178 L116 230Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>' % (h, INK) +
                '<path d="M200 88 L214 52 L226 92 L246 66 L250 100Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>' % (h, INK) +
                '<path d="M150 118 Q190 100 236 108" stroke="#8a93d6" stroke-width="7" opacity=".6" fill="none" stroke-linecap="round"/>')
    if s == "long":  # straight bangs and long side locks
        return ('<path d="M102 214 C98 132 160 92 200 92 C242 92 302 132 298 214 L280 206 L262 214 L244 206 L226 214 L208 206 L190 214 L172 206 L154 214 L136 206 L118 214Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>' % (h, INK) +
                '<path d="M102 214 C98 270 100 330 108 390 L136 390 C128 330 126 270 130 214Z" fill="%s" stroke="%s" stroke-width="4"/>' % (h, INK) +
                '<path d="M298 214 C302 270 300 330 292 390 L264 390 C272 330 274 270 270 214Z" fill="%s" stroke="%s" stroke-width="4"/>' % (h, INK) +
                '<path d="M148 118 Q192 102 240 112" stroke="#b9a3e0" stroke-width="7" opacity=".55" fill="none" stroke-linecap="round"/>')
    return ('<path d="M100 236 C94 136 160 90 206 92 C254 94 310 140 300 236 L288 236 C280 200 260 170 230 156 C220 190 180 214 132 226 L118 260Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>' % (h, INK) +
            '<path d="M160 120 Q200 102 240 114" stroke="#ffd6a8" stroke-width="7" opacity=".6" fill="none" stroke-linecap="round"/>')


def accessory(c):
    a = c["acc"]
    if a == "ribbon":
        return ('<g transform="translate(272 128) rotate(18)"><path d="M0 0 L-34 -22 L-30 22Z" fill="#3cc6c0" stroke="%s" stroke-width="3.5" stroke-linejoin="round"/>'
                '<path d="M0 0 L34 -22 L30 22Z" fill="#3cc6c0" stroke="%s" stroke-width="3.5" stroke-linejoin="round"/><circle r="9" fill="#2fa9a3" stroke="%s" stroke-width="3.5"/></g>' % (INK, INK, INK))
    if a == "flower":
        petals_ = "".join('<circle cx="%.0f" cy="%.0f" r="11" fill="#fff4f8" stroke="%s" stroke-width="3"/>' % (math.cos(i * 1.2566) * 13, math.sin(i * 1.2566) * 13, INK) for i in range(5))
        return '<g transform="translate(276 132)">' + petals_ + '<circle r="8" fill="#ffd24a" stroke="%s" stroke-width="3"/></g>' % INK
    if a == "glasses":
        return ('<g fill="none" stroke="%s" stroke-width="4"><rect x="132" y="228" width="58" height="48" rx="14"/><rect x="210" y="228" width="58" height="48" rx="14"/>'
                '<path d="M190 248 Q200 242 210 248"/></g><path d="M140 236 L160 236" stroke="#fff" stroke-width="3" opacity=".7"/>' % INK)
    return '<g transform="translate(128 196) rotate(-28)"><rect x="-22" y="-7" width="44" height="14" rx="7" fill="#ffd24a" stroke="%s" stroke-width="3.5"/><circle cx="16" r="5" fill="#ff4f8b"/></g>' % INK


def outfit(c):
    o, o2 = c["outfit"], c["outfit2"]
    torso = '<path d="M70 600 C72 480 120 420 200 416 C280 420 328 480 330 600Z" fill="%s" stroke="%s" stroke-width="4"/>' % (o, INK)
    if c["style"] == "bob":   # cardigan + bow
        det = ('<path d="M168 418 L200 470 L232 418" fill="#fff" stroke="%s" stroke-width="3.5" stroke-linejoin="round"/>' % INK +
               '<path d="M200 470 L200 600" stroke="%s" stroke-width="3"/>' % INK +
               '<path d="M200 448 L178 436 L180 462Z M200 448 L222 436 L220 462Z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/>' % (o2, INK) +
               '<circle cx="186" cy="520" r="5" fill="%s"/><circle cx="186" cy="560" r="5" fill="%s"/>' % (o2, o2))
    elif c["style"] == "spiky":  # blazer + shirt + tie
        det = ('<path d="M172 418 L200 470 L228 418Z" fill="%s" stroke="%s" stroke-width="3.5" stroke-linejoin="round"/>' % (o2, INK) +
               '<path d="M194 440 L206 440 L212 520 L200 534 L188 520Z" fill="#ff4f8b" stroke="%s" stroke-width="3" stroke-linejoin="round"/>' % INK +
               '<path d="M150 430 L188 520 M250 430 L212 520" stroke="%s" stroke-width="3.5"/>' % INK)
    elif c["style"] == "long":  # sailor uniform: wide collar + scarf
        det = ('<path d="M120 440 C150 430 168 420 176 418 L200 476 L224 418 C232 420 250 430 280 440 L262 488 L200 500 L138 488Z" fill="#fff" stroke="%s" stroke-width="3.5" stroke-linejoin="round"/>' % INK +
               '<path d="M134 458 L196 494 M266 458 L204 494" stroke="%s" stroke-width="4"/>' % o +
               '<path d="M184 478 L216 478 L226 520 L200 508 L174 520Z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/>' % (o2, INK))
    else:  # hoodie
        det = ('<path d="M140 430 C150 470 250 470 260 430" fill="none" stroke="%s" stroke-width="3.5"/>' % INK +
               '<path d="M180 460 L176 520 M220 460 L224 520" stroke="%s" stroke-width="3.5" stroke-linecap="round"/>' % o2 +
               '<rect x="150" y="530" width="100" height="50" rx="16" fill="none" stroke="%s" stroke-width="3"/>' % INK)
    return torso + det


def character(name, expr):
    c = CHARS[name]
    blush = 0.75 if expr == "shy" else 0.35
    parts = [hair_back(c),
             '<rect x="178" y="330" width="44" height="100" rx="18" fill="%s" stroke="%s" stroke-width="4"/>' % (SKIN, INK),
             '<path d="M178 400 Q200 420 222 400" fill="%s"/>' % SKIN_SHADE,
             outfit(c),
             '<ellipse cx="104" cy="258" rx="14" ry="20" fill="%s" stroke="%s" stroke-width="4"/><ellipse cx="296" cy="258" rx="14" ry="20" fill="%s" stroke="%s" stroke-width="4"/>' % (SKIN, INK, SKIN, INK),
             '<path d="M108 230 C108 150 292 150 292 230 C292 296 250 344 200 352 C150 344 108 296 108 230Z" fill="%s" stroke="%s" stroke-width="4"/>' % (SKIN, INK),
             '<ellipse cx="148" cy="290" rx="22" ry="11" fill="#ff7fa6" opacity="%s"/><ellipse cx="252" cy="290" rx="22" ry="11" fill="#ff7fa6" opacity="%s"/>' % (blush, blush),
             eye(160, 252, c["eyes"], expr, -1), eye(240, 252, c["eyes"], expr, 1),
             '<path d="M198 280 L202 286" stroke="%s" stroke-width="3" stroke-linecap="round"/>' % SKIN_SHADE,
             mouth(expr), hair_front(c), brows(expr, c["hair_dark"]), accessory(c)]
    if expr == "shy":
        parts.append('<g stroke="%s" stroke-width="3" stroke-linecap="round"><path d="M134 280 l8 -8 M146 282 l8 -8 M246 280 l8 -8 M258 282 l8 -8"/></g>' % "#e0507a")
    if expr == "angry":
        parts.append('<g transform="translate(290 120)" stroke="#e0294f" stroke-width="5" stroke-linecap="round" fill="none"><path d="M-12 -4 Q-4 -4 -4 -12 M4 -12 Q4 -4 12 -4 M12 4 Q4 4 4 12 M-4 12 Q-4 4 -12 4"/></g>')
    if expr == "sad":
        parts.append('<path d="M262 276 C256 290 256 298 262 302 C268 298 268 290 262 276Z" fill="#9fd8f2" stroke="%s" stroke-width="2.5"/>' % INK)
    if expr == "surprised":
        parts.append('<g stroke="%s" stroke-width="4" stroke-linecap="round"><path d="M86 140 l-18 -14 M78 170 l-24 -2 M314 140 l18 -14 M322 170 l24 -2"/></g>' % INK)
    return svg(400, 600, "".join(parts))


def cat(expr):
    k = "#2b2540"
    eyes = {
        "neutral": '<ellipse cx="170" cy="380" rx="22" ry="26" fill="#ffd24a" stroke="%s" stroke-width="3"/><ellipse cx="170" cy="382" rx="6" ry="20" fill="%s"/><ellipse cx="230" cy="380" rx="22" ry="26" fill="#ffd24a" stroke="%s" stroke-width="3"/><ellipse cx="230" cy="382" rx="6" ry="20" fill="%s"/><circle cx="163" cy="370" r="5" fill="#fff"/><circle cx="223" cy="370" r="5" fill="#fff"/>' % (INK, INK, INK, INK),
        "happy": '<path d="M150 384 Q170 362 190 384 M210 384 Q230 362 250 384" stroke="#ffd24a" stroke-width="7" fill="none" stroke-linecap="round"/>',
        "surprised": '<circle cx="170" cy="380" r="28" fill="#ffd24a" stroke="%s" stroke-width="3"/><circle cx="170" cy="382" r="14" fill="%s"/><circle cx="230" cy="380" r="28" fill="#ffd24a" stroke="%s" stroke-width="3"/><circle cx="230" cy="382" r="14" fill="%s"/><circle cx="163" cy="372" r="6" fill="#fff"/><circle cx="223" cy="372" r="6" fill="#fff"/>' % (INK, INK, INK, INK),
    }[expr]
    m = '<path d="M190 420 Q200 430 210 420" stroke="#ff9fbe" stroke-width="4" fill="none" stroke-linecap="round"/>' if expr != "surprised" else '<ellipse cx="200" cy="426" rx="8" ry="9" fill="#ff9fbe"/>'
    body = ('<path d="M300 560 C380 540 380 460 330 450 C360 480 350 520 300 530Z" fill="%s" stroke="%s" stroke-width="4"/>' % (k, INK) +
            '<path d="M110 600 C100 500 140 450 200 450 C260 450 300 500 290 600Z" fill="%s" stroke="%s" stroke-width="4"/>' % (k, INK) +
            '<path d="M120 300 L128 220 L176 280 Z M280 300 L272 220 L224 280Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>' % (k, INK) +
            '<path d="M132 252 L140 232 L158 262Z M268 252 L260 232 L242 262Z" fill="#ff9fbe"/>' +
            '<ellipse cx="200" cy="380" rx="100" ry="90" fill="%s" stroke="%s" stroke-width="4"/>' % (k, INK) +
            '<path d="M194 408 L206 408 L200 416Z" fill="#ff9fbe"/>' +
            '<g stroke="#8a84a8" stroke-width="2.5" stroke-linecap="round"><path d="M130 410 L80 400 M130 420 L82 428 M270 410 L320 400 M270 420 L318 428"/></g>' +
            '<path d="M150 470 Q200 500 250 470" stroke="#ff4f8b" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="200" cy="492" r="11" fill="#ffd24a" stroke="%s" stroke-width="3"/>' % INK)
    return svg(400, 600, body + eyes + m)


def stranger(expr):
    k = "#1d1a33"
    eyes = ('<ellipse cx="172" cy="262" rx="12" ry="7" fill="#8fe3df"/><ellipse cx="228" cy="262" rx="12" ry="7" fill="#8fe3df"/>' if expr == "neutral"
            else '<path d="M160 266 Q172 252 184 266 M216 266 Q228 252 240 266" stroke="#8fe3df" stroke-width="6" fill="none" stroke-linecap="round"/>')
    body = ('<rect x="176" y="320" width="48" height="110" rx="18" fill="%s"/>' % k +
            '<path d="M60 600 C64 470 120 410 200 404 C280 410 336 470 340 600Z" fill="%s"/>' % k +
            '<path d="M120 250 C120 170 280 170 280 250 C280 320 240 350 200 352 C160 350 120 320 120 250Z" fill="%s"/>' % k +
            '<path d="M100 190 L300 190 L284 200 L116 200Z" fill="#2c2850"/><path d="M128 190 C128 120 272 120 272 190Z" fill="#2c2850"/>' +
            '<rect x="182" y="146" width="36" height="22" rx="6" fill="#ffd24a"/>' +
            '<path d="M170 420 L200 470 L230 420" stroke="#ffd24a" stroke-width="5" fill="none"/>' +
            '<g fill="#ffd24a"><circle cx="200" cy="500" r="6"/><circle cx="200" cy="540" r="6"/><circle cx="200" cy="580" r="6"/></g>')
    return svg(400, 600, body + eyes)


def robot(expr):
    k = "#8fe3df"
    face = {
        "neutral": '<rect x="150" y="196" width="30" height="40" rx="12" fill="%s"/><rect x="220" y="196" width="30" height="40" rx="12" fill="%s"/><path d="M182 252 L218 252" stroke="%s" stroke-width="6" stroke-linecap="round"/>' % (k, k, k),
        "happy": '<path d="M146 226 Q165 196 184 226 M216 226 Q235 196 254 226" stroke="%s" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M176 246 Q200 268 224 246" stroke="%s" stroke-width="7" fill="none" stroke-linecap="round"/>' % (k, k),
        "sad": '<path d="M146 210 Q165 236 184 210 M216 210 Q235 236 254 210" stroke="%s" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M180 258 Q200 244 220 258" stroke="%s" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M258 232 C252 246 252 254 258 258 C264 254 264 246 258 232Z" fill="%s"/>' % (k, k, k),
        "surprised": '<circle cx="165" cy="214" r="22" fill="none" stroke="%s" stroke-width="9"/><circle cx="235" cy="214" r="22" fill="none" stroke="%s" stroke-width="9"/><circle cx="200" cy="256" r="9" fill="%s"/>' % (k, k, k),
    }[expr]
    glow = "#ff4f8b" if expr != "sad" else "#8a93d6"
    body = ('<line x1="200" y1="78" x2="200" y2="134" stroke="%s" stroke-width="6"/><circle cx="200" cy="72" r="14" fill="%s" stroke="%s" stroke-width="4"/>' % (INK, glow, INK) +
            '<path d="M86 600 C88 470 128 352 200 348 C272 352 312 470 314 600Z" fill="#e8e6f2" stroke="%s" stroke-width="4"/>' % INK +
            '<rect x="178" y="296" width="44" height="60" rx="10" fill="#8a87a8" stroke="%s" stroke-width="4"/>' % INK +
            '<rect x="150" y="410" width="100" height="84" rx="18" fill="#3cc6c0" stroke="%s" stroke-width="4"/>' % INK +
            '<circle cx="176" cy="438" r="8" fill="#fff"/><circle cx="200" cy="438" r="8" fill="%s"/><circle cx="224" cy="438" r="8" fill="#ffd24a"/><rect x="168" y="460" width="64" height="12" rx="6" fill="#1c2340"/>' % glow +
            '<circle cx="88" cy="214" r="24" fill="#3cc6c0" stroke="%s" stroke-width="4"/><circle cx="312" cy="214" r="24" fill="#3cc6c0" stroke="%s" stroke-width="4"/>' % (INK, INK) +
            '<rect x="96" y="130" width="208" height="176" rx="56" fill="#e8e6f2" stroke="%s" stroke-width="4"/>' % INK +
            '<rect x="120" y="158" width="160" height="120" rx="34" fill="#1c2340" stroke="%s" stroke-width="4"/>' % INK +
            '<path d="M136 172 Q160 164 186 168" stroke="#fff" stroke-width="5" opacity=".35" fill="none" stroke-linecap="round"/>')
    if expr == "surprised":
        body += '<g stroke="%s" stroke-width="4" stroke-linecap="round"><path d="M70 130 l-18 -14 M62 160 l-24 -2 M330 130 l18 -14 M338 160 l24 -2"/></g>' % INK
    return svg(400, 600, body + face)


def fox(expr):
    f, w = "#f08a3c", "#fff4e6"
    eyes = {
        "neutral": '<path d="M150 372 Q170 358 190 372 Q170 384 150 372Z" fill="#7a3fd0" stroke="%s" stroke-width="3"/><path d="M210 372 Q230 358 250 372 Q230 384 210 372Z" fill="#7a3fd0" stroke="%s" stroke-width="3"/><circle cx="166" cy="368" r="4" fill="#fff"/><circle cx="226" cy="368" r="4" fill="#fff"/>' % (INK, INK),
        "happy": '<path d="M150 380 Q170 358 190 380 M210 380 Q230 358 250 380" stroke="%s" stroke-width="7" fill="none" stroke-linecap="round"/>' % INK,
        "surprised": '<circle cx="170" cy="372" r="20" fill="#7a3fd0" stroke="%s" stroke-width="3"/><circle cx="230" cy="372" r="20" fill="#7a3fd0" stroke="%s" stroke-width="3"/><circle cx="164" cy="364" r="6" fill="#fff"/><circle cx="224" cy="364" r="6" fill="#fff"/>' % (INK, INK),
    }[expr]
    m = '<path d="M188 422 Q200 432 212 422" stroke="%s" stroke-width="4" fill="none" stroke-linecap="round"/>' % INK if expr != "surprised" else '<ellipse cx="200" cy="428" rx="8" ry="9" fill="#c2405f" stroke="%s" stroke-width="3"/>' % INK
    body = ('<path d="M290 590 C400 560 400 420 340 380 C360 450 340 500 290 520Z" fill="%s" stroke="%s" stroke-width="4"/><path d="M340 380 C372 404 384 440 376 470 C360 440 350 410 340 380Z" fill="%s"/>' % (f, INK, w) +
            '<path d="M110 600 C100 500 140 450 200 450 C260 450 300 500 290 600Z" fill="%s" stroke="%s" stroke-width="4"/>' % (f, INK) +
            '<path d="M160 600 C160 520 180 480 200 480 C220 480 240 520 240 600Z" fill="%s"/>' % w +
            '<path d="M110 320 L118 190 L186 284 Z M290 320 L282 190 L214 284Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>' % (f, INK) +
            '<path d="M124 290 L128 220 L166 274Z M276 290 L272 220 L234 274Z" fill="#2a1f2d"/>' +
            '<path d="M100 380 C100 300 150 280 200 280 C250 280 300 300 300 380 C300 420 260 450 200 452 C140 450 100 420 100 380Z" fill="%s" stroke="%s" stroke-width="4"/>' % (f, INK) +
            '<path d="M130 400 C150 450 250 450 270 400 C250 420 220 410 200 400 C180 410 150 420 130 400Z" fill="%s"/>' % w +
            '<ellipse cx="200" cy="408" rx="11" ry="8" fill="%s"/>' % INK +
            '<path d="M170 300 L200 330 L230 300" stroke="#e5484d" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="200" cy="332" r="6" fill="#e5484d"/>' +
            '<path d="M150 470 Q200 496 250 470" stroke="#e5484d" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="200" cy="490" r="12" fill="#ffd24a" stroke="%s" stroke-width="3"/>' % INK)
    return svg(400, 600, body + eyes + m)


# ------------------------------------------------------------------------------------------------ CGs and covers
def strip(s):
    return s.split(">", 1)[1].rsplit("</svg>", 1)[0]


def nested(svg_text, x, y, w, h, mode="xMidYMid slice"):
    vb = svg_text.split('viewBox="', 1)[1].split('"', 1)[0]
    inner = strip(svg_text)
    if inner.startswith("<defs>"):
        pass
    return '<svg x="%s" y="%s" width="%s" height="%s" viewBox="%s" preserveAspectRatio="%s">%s</svg>' % (x, y, w, h, vb, mode, inner)


def uniq(svg_text, prefix):
    """Give gradient ids a prefix so several pictures can sit in one file."""
    for gid in ("sky", "glow", "wall", "lamp", "win", "plat", "night", "vig", "sun", "sea", "space"):
        svg_text = svg_text.replace('id="%s"' % gid, 'id="%s%s"' % (prefix, gid)).replace("url(#%s)" % gid, "url(#%s%s)" % (prefix, gid))
    return svg_text


def cover(bg_svg, chars, tint):
    body = [nested(uniq(bg_svg, "b"), 0, 0, 600, 900)]
    body.append('<rect width="600" height="900" fill="%s" opacity=".18"/>' % tint)
    n = len(chars)
    for i, ch in enumerate(chars):
        w = 520 if n == 1 else 420
        x = (600 - w) / 2 if n == 1 else (-30 + i * 210)
        body.append(nested(uniq(ch, "c%d" % i), x, 900 - w * 1.5 + 40, w, w * 1.5, "xMidYMax meet"))
    body.append('<rect width="600" height="900" fill="url(#vig)"/>')
    defs = '<linearGradient id="vig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1424" stop-opacity=".35"/><stop offset=".35" stop-color="#1a1424" stop-opacity="0"/><stop offset=".8" stop-color="#1a1424" stop-opacity="0"/><stop offset="1" stop-color="#1a1424" stop-opacity=".45"/></linearGradient>'
    return svg(600, 900, "".join(body), defs)


def cg_promise():
    rng = random.Random(42)
    defs = grad("sky", [("0", "#5b4b9a"), ("0.5", "#ff7fa6"), ("1", "#ffd59a")])
    b = ['<rect width="900" height="900" fill="url(#sky)"/>', '<circle cx="450" cy="600" r="160" fill="#fff0b3" opacity=".9"/>',
         '<path d="M0 640 C200 610 700 610 900 640 L900 900 L0 900Z" fill="#6b4a7d"/>',
         sakura_tree(rng, 450, 690, 1.6, "#3a2238", ["#ff8fb3", "#ff6f9f", "#ffa6c4"])]
    # two silhouettes holding hands
    b.append('<g fill="#2a1a33"><circle cx="390" cy="560" r="30"/><path d="M350 700 C350 620 370 595 390 595 C410 595 430 620 430 700Z"/>'
             '<circle cx="510" cy="566" r="28"/><path d="M472 700 C472 624 490 600 510 600 C530 600 548 624 548 700Z"/>'
             '<path d="M380 556 C356 540 352 600 366 620" fill="#2a1a33"/><path d="M425 640 Q450 652 475 640" stroke="#2a1a33" stroke-width="10" fill="none" stroke-linecap="round"/></g>')
    b.append('<path d="M450 520 c-10 -16 -34 -6 -22 12 l22 22 l22 -22 c12 -18 -12 -28 -22 -12z" fill="#ff4f8b" opacity=".9"/>')
    b.append(petals(rng, 90, "#ffd0df"))
    return svg(900, 900, "".join(b), defs)


def cg_train():
    rng = random.Random(8)
    defs = grad("sky", [("0", "#0f1230"), ("1", "#3a3470")]) + rgrad("glow", [("0", "#ffe7a8", "0.8"), ("1", "#ffe7a8", "0")])
    b = ['<rect width="900" height="900" fill="#20203a"/>', '<rect x="90" y="140" width="720" height="460" rx="40" fill="url(#sky)" stroke="#e8e6f2" stroke-width="22"/>']
    for _ in range(60):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#fff" opacity="%.2f"/>' % (rng.uniform(110, 790), rng.uniform(160, 400), rng.uniform(.6, 2), rng.uniform(.3, 1)))
    for i in range(14):
        b.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#ffd27a" opacity=".55"/>' % (110 + i * 50, 420 + (i % 3) * 30, 16, 6))
    b.append('<path d="M110 520 C300 470 500 540 790 480 L790 580 L110 580Z" fill="#141433"/>')
    b.append('<g opacity=".35"><circle cx="560" cy="330" r="56" fill="#ffe4d4"/><path d="M470 600 C470 470 520 420 560 420 C600 420 650 470 650 600Z" fill="#ff8fb8"/></g>')
    b.append('<rect x="0" y="640" width="900" height="260" fill="#3a3460"/><rect x="0" y="640" width="900" height="18" fill="#ff4f8b"/>')
    b.append('<circle cx="250" cy="760" r="160" fill="url(#glow)"/><rect x="200" y="700" width="90" height="70" rx="12" fill="#f4f1ea"/><rect x="214" y="714" width="62" height="10" rx="5" fill="#3cc6c0"/>')
    return svg(900, 900, "".join(b), defs)


def cg_fireworks():
    rng = random.Random(77)
    defs = grad("sky", [("0", "#0f0d2e"), ("0.7", "#2f2460"), ("1", "#5a3a6e")])
    b = ['<rect width="900" height="900" fill="url(#sky)"/>']
    for cx, cy, r, col in ((300, 260, 170, "#ff7fa6"), (620, 200, 200, "#ffd24a"), (470, 400, 110, "#8fe3df"), (760, 420, 90, "#ff9a3c"), (140, 430, 80, "#c7a6ff")):
        for i in range(36):
            a = i * math.pi * 2 / 36
            b.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="%s" stroke-width="5" stroke-linecap="round" opacity=".9"/>'
                     % (cx + math.cos(a) * r * .3, cy + math.sin(a) * r * .3, cx + math.cos(a) * r, cy + math.sin(a) * r, col))
            b.append('<circle cx="%.0f" cy="%.0f" r="5" fill="#fff"/>' % (cx + math.cos(a) * r * 1.06, cy + math.sin(a) * r * 1.06))
    b.append('<path d="M0 600 L900 600 L900 900 L0 900Z" fill="#1d1838"/><path d="M0 640 C300 620 600 660 900 630 L900 700 L0 700Z" fill="#2a3a6e" opacity=".8"/>')
    for _ in range(50):
        x = rng.uniform(0, 900)
        b.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="%s" stroke-width="3" opacity=".6"/>' % (x, rng.uniform(645, 695), x + 18, rng.uniform(645, 695), rng.choice(["#ff7fa6", "#ffd24a", "#8fe3df"])))
    # two people from behind on the riverbank
    b.append('<g fill="#120e24"><circle cx="400" cy="660" r="36"/><path d="M340 900 C340 760 370 700 400 700 C430 700 460 760 460 900Z"/>'
             '<circle cx="510" cy="668" r="34"/><path d="M455 900 C455 770 482 708 510 708 C538 708 565 770 565 900Z"/>'
             '<path d="M372 640 C356 600 446 600 428 646Z"/><path d="M540 650 C560 700 580 760 560 800" stroke="#120e24" stroke-width="16" fill="none" stroke-linecap="round"/></g>')
    return svg(900, 900, "".join(b), defs)


def sky_lantern(x, y, size, color, glow="glow", ribbon=None):
    """A paper sky lantern (wider at the top), its glow and a small flame. ribbon = a colour for a bow."""
    s = size
    out = ['<circle cx="%.0f" cy="%.0f" r="%.0f" fill="url(#%s)"/>' % (x, y, s * 2.2, glow),
           '<path d="M%.0f %.0f Q%.0f %.0f %.0f %.0f L%.0f %.0f Q%.0f %.0f %.0f %.0f Z" fill="%s" stroke="#2a1f3d" stroke-width="%.1f"/>' % (
               x - s * .75, y - s, x, y - s * 1.25, x + s * .75, y - s, x + s * .55, y + s, x, y + s * 1.1, x - s * .55, y + s, color, max(1.5, s * .08)),
           '<path d="M%.0f %.0f Q%.0f %.0f %.0f %.0f" stroke="#fff6d6" stroke-width="%.1f" fill="none" opacity=".55"/>' % (
               x - s * .35, y - s * .8, x - s * .45, y, x - s * .3, y + s * .8, max(1, s * .1)),
           '<ellipse cx="%.0f" cy="%.0f" rx="%.1f" ry="%.1f" fill="#fff3a6"/>' % (x, y + s * 1.12, s * .16, s * .24)]
    if ribbon:
        out.append('<path d="M%.0f %.0f l%.0f %.0f l0 %.0f Z M%.0f %.0f l%.0f %.0f l0 %.0f Z" fill="%s" stroke="#2a1f3d" stroke-width="2"/>' % (
            x, y - s * .2, -s * .5, -s * .3, s * .6, x, y - s * .2, s * .5, -s * .3, s * .6, ribbon))
        out.append('<path d="M%.0f %.0f l%.0f %.0f M%.0f %.0f l%.0f %.0f" stroke="%s" stroke-width="%.1f" stroke-linecap="round"/>' % (
            x, y - s * .2, -s * .25, s * .9, x, y - s * .2, s * .2, s * .95, ribbon, s * .12))
    return "".join(out)


def cg_lanterns():
    """Two lanterns rising over Hoshimachi from the shrine, among hundreds of others."""
    rng = random.Random(1926)
    defs = grad("sky", [("0", "#0f0d2e"), ("0.55", "#33285e"), ("1", "#8a4d7a")]) + rgrad("glow", [("0", "#ffcf7a", "0.75"), ("1", "#ffcf7a", "0")])
    b = ['<rect width="900" height="900" fill="url(#sky)"/>']
    for _ in range(70):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#fff" opacity="%.2f"/>' % (rng.uniform(0, 900), rng.uniform(0, 520), rng.uniform(.6, 1.8), rng.uniform(.3, .9)))
    b.append('<circle cx="150" cy="140" r="54" fill="#fff4cf"/><circle cx="172" cy="128" r="50" fill="#1f1844" opacity=".9"/>')
    # sea and town far below
    b.append('<path d="M0 640 L900 640 L900 900 L0 900Z" fill="#241d4a"/>')
    for _ in range(26):
        x = rng.uniform(0, 900)
        b.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#ffcf7a" stroke-width="2" opacity=".35"/>' % (x, rng.uniform(650, 700), x + 22, rng.uniform(650, 700)))
    b.append('<path d="M0 700 L80 690 L110 650 L170 660 L220 620 L300 640 L360 610 L430 650 L520 630 L600 655 L680 615 L760 640 L840 620 L900 640 L900 760 L0 760Z" fill="#1a1433"/>')
    for _ in range(60):
        b.append('<rect x="%.0f" y="%.0f" width="6" height="7" fill="#ffd27a" opacity="%.2f"/>' % (rng.uniform(0, 900), rng.uniform(650, 740), rng.uniform(.4, .9)))
    # hundreds of lanterns: small and high far away, bigger and lower close up
    for _ in range(90):
        y = rng.uniform(40, 600)
        size = 4 + (y / 600) * 14
        b.append(sky_lantern(rng.uniform(10, 890), y, size, rng.choice(["#ff9a3c", "#ffb347", "#ffd24a", "#ff7f6a"])))
    # the two that matter, side by side
    b.append(sky_lantern(410, 330, 46, "#b48ae0", ribbon="#7a4fc4"))
    b.append(sky_lantern(515, 300, 46, "#ffb347"))
    # the shrine steps and two people watching, from behind
    b.append('<path d="M250 900 L320 770 L580 770 L650 900Z" fill="#3a2c4a" stroke="#1a1326" stroke-width="4"/>')
    for i in range(3):
        b.append('<rect x="%d" y="%d" width="%d" height="8" fill="#1a1326" opacity=".5"/>' % (310 - i * 22, 800 + i * 34, 280 + i * 44))
    b.append('<g fill="#120e24"><circle cx="410" cy="720" r="30"/><path d="M362 860 C362 770 385 742 410 742 C435 742 458 770 458 860Z"/>'
             '<circle cx="500" cy="726" r="28"/><path d="M455 860 C455 776 476 748 500 748 C524 748 545 776 545 860Z"/>'
             '<path d="M382 706 C370 676 440 676 432 712Z"/><path d="M455 800 Q478 812 500 798" stroke="#120e24" stroke-width="9" fill="none"/></g>')
    b.append('<path d="M392 712 l-14 -10 l0 18Z" fill="#b48ae0"/>')
    return svg(900, 900, "".join(b), defs)


def cg_wishrack():
    """The shrine's wish rack at night: rows of paper lanterns, two of them glowing."""
    rng = random.Random(30)
    defs = grad("sky", [("0", "#1a1433"), ("1", "#3b2a55")]) + rgrad("glow", [("0", "#ffcf7a", "0.85"), ("1", "#ffcf7a", "0")]) + \
        rgrad("vig", [("0", "#b48ae0", "0.7"), ("1", "#b48ae0", "0")])
    b = ['<rect width="900" height="900" fill="url(#sky)"/>']
    for _ in range(40):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#e9ff9a" opacity="%.2f"/>' % (rng.uniform(0, 900), rng.uniform(0, 900), rng.uniform(1.5, 3.5), rng.uniform(.2, .7)))
    # the wooden rack
    wood = "#6b4a3a"
    b.append('<rect x="70" y="120" width="28" height="760" fill="%s" stroke="#1a1326" stroke-width="4"/><rect x="802" y="120" width="28" height="760" fill="%s" stroke="#1a1326" stroke-width="4"/>' % (wood, wood))
    b.append('<path d="M40 110 Q450 80 860 110 L860 140 Q450 112 40 140Z" fill="#e5484d" stroke="#1a1326" stroke-width="4"/>')
    rows = (230, 450, 670)
    for ry in rows:
        b.append('<rect x="70" y="%d" width="760" height="16" fill="%s" stroke="#1a1326" stroke-width="3"/>' % (ry - 70, wood))
    special = {(0, 4): ("#b48ae0", "#7a4fc4"), (1, 6): ("#ffb347", None)}
    for r, ry in enumerate(rows):
        for i in range(9):
            x = 130 + i * 80 + (r % 2) * 20
            if x > 800:
                continue
            col, ribbon = special.get((r, i), (rng.choice(["#f4ead2", "#efe1c4", "#f7e9d9", "#ead8bd"]), None))
            glow = (r, i) in special
            b.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#1a1326" stroke-width="2"/>' % (x, ry - 54, x, ry - 30))
            if glow:
                b.append('<circle cx="%d" cy="%d" r="95" fill="url(#%s)"/>' % (x, ry, "vig" if ribbon else "glow"))
            b.append('<rect x="%d" y="%d" width="54" height="70" rx="22" fill="%s" stroke="#1a1326" stroke-width="3" opacity="%s"/>' % (x - 27, ry - 32, col, "1" if glow else ".8"))
            b.append('<rect x="%d" y="%d" width="30" height="6" fill="#1a1326"/><rect x="%d" y="%d" width="30" height="6" fill="#1a1326"/>' % (x - 15, ry - 36, x - 15, ry + 34))
            for k in range(3):
                b.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#2a1f3d" stroke-width="2" opacity="%s"/>' % (
                    x - 14, ry - 10 + k * 12, x + rng.randint(4, 16), ry - 10 + k * 12, ".85" if glow else ".25"))
            if ribbon:
                b.append('<path d="M%d %d l-22 -14 l0 28Z M%d %d l22 -14 l0 28Z" fill="%s" stroke="#1a1326" stroke-width="2"/>' % (x, ry - 30, x, ry - 30, ribbon))
                b.append('<path d="M%d %d l-10 40 M%d %d l10 42" stroke="%s" stroke-width="5" stroke-linecap="round"/>' % (x, ry - 30, x, ry - 30, ribbon))
    b.append(petals(rng, 16, "#ffb38a", area=(0, 0, 900, 900), size=(5, 9), opacity=.6))
    return svg(900, 900, "".join(b), defs)


def cover_lantern(bg_svg, chars):
    """Lantern Night's cover: the festival, Hana and the fox, with lanterns rising over them."""
    rng = random.Random(7)
    base = cover(bg_svg, chars, "#2a1f3d")
    extra = "".join(sky_lantern(rng.uniform(30, 570), y, 6 + y / 40, rng.choice(["#ff9a3c", "#ffb347", "#ffd24a"]), glow="lg")
                    for y in sorted(rng.uniform(40, 420) for _ in range(24)))
    extra += sky_lantern(300, 170, 34, "#b48ae0", glow="lg", ribbon="#7a4fc4")
    lg = '<radialGradient id="lg"><stop offset="0" stop-color="#ffcf7a" stop-opacity="0.7"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>'
    return base.replace("</defs>", lg + "</defs>", 1).replace("</svg>\n", extra + "</svg>\n")


def main():
    OUT.mkdir(exist_ok=True)
    files = {}
    bgs = {"bg-sakura-park": bg_sakura(False), "bg-sakura-night": bg_sakura(True), "bg-classroom": bg_classroom(), "bg-cafe": bg_cafe(),
           "bg-station-night": bg_station(), "bg-rooftop-sunset": bg_rooftop(), "bg-library": bg_library(), "bg-bedroom": bg_bedroom(),
           "bg-festival": bg_festival(), "bg-shrine": bg_shrine(), "bg-beach": bg_beach(), "bg-spaceship": bg_spaceship(),
           "bg-station-dawn": bg_station(dawn=True)}
    files.update(bgs)
    for name in CHARS:
        for e in EXPRESSIONS:
            files["%s-%s" % (name, e)] = character(name, e)
    for e in ("neutral", "happy", "surprised"):
        files["kuro-" + e] = cat(e)
    files["stranger-neutral"] = stranger("neutral")
    files["stranger-smile"] = stranger("smile")
    for e in ("neutral", "happy", "sad", "surprised"):
        files["byte-" + e] = robot(e)
    for e in ("neutral", "happy", "surprised"):
        files["yoru-" + e] = fox(e)
    files["cg-promise"] = cg_promise()
    files["cg-train"] = cg_train()
    files["cg-fireworks"] = cg_fireworks()
    files["cg-lanterns"] = cg_lanterns()
    files["cg-wishrack"] = cg_wishrack()
    files["cover-cherry"] = cover(bgs["bg-sakura-park"], [files["mira-happy"]], "#ff4f8b")
    files["cover-train"] = cover(bgs["bg-station-night"], [files["ren-neutral"]], "#2a2238")
    files["cover-rooftop"] = cover(bgs["bg-rooftop-sunset"], [files["sol-happy"], files["mira-surprised"]], "#ff7fa6")
    files["cover-library"] = cover(bgs["bg-library"], [files["kuro-happy"]], "#3a2f4d")
    files["cover-festival"] = cover(bgs["bg-festival"], [files["ren-shy"], files["hana-happy"]], "#33285e")
    files["cover-signal"] = cover(bgs["bg-spaceship"], [files["sol-surprised"], files["byte-happy"]], "#1b2036")
    files["cover-shrine"] = cover(bgs["bg-shrine"], [files["hana-neutral"], files["yoru-neutral"]], "#2b2350")
    files["cover-cafe"] = cover(bgs["bg-cafe"], [files["sol-happy"], files["kuro-happy"]], "#5a3a3f")
    files["cover-beach"] = cover(bgs["bg-beach"], [files["mira-happy"], files["hana-surprised"]], "#ff8fa6")
    files["cover-lantern"] = cover_lantern(bgs["bg-festival"], [files["hana-happy"], files["yoru-neutral"]])
    for old in OUT.glob("demo-*.svg"):
        old.unlink()
    total = 0
    for name, text in files.items():
        p = OUT / ("demo-%s.svg" % name)
        p.write_text(text, encoding="utf-8", newline="\n")
        total += len(text)
    print("wrote %d pictures (%d KB) to %s" % (len(files), total // 1024, OUT))


if __name__ == "__main__":
    main()
