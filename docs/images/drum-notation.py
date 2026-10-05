"""Draws the drum notation figures on docs/drums/notation.mdx: drum-key.svg, hit-key.svg and
sheet-to-code.svg, beside this file. Run it again when a drum is added or renamed:

    python3 docs/images/drum-notation.py

The colours and fonts are the other figures' own: the <style> block is read from
lines-line-up.svg, with three classes added for the notation's ink."""
import html
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
style = re.search(r"<style>.*?</style>", (HERE / "lines-line-up.svg").read_text(), re.S).group(0)
# Notation ink follows the text colour in both themes.
style = style.replace(
    "@media", ".ink{fill:#1a1a1a} .pen{stroke:#1a1a1a;fill:none;stroke-linecap:round} .staff{stroke:#8a8a8a;stroke-width:1}\n@media"
).replace(
    ".rule{stroke:#e1e4e8}", ".rule{stroke:#e1e4e8} .ink{fill:#e1e4e8} .pen{stroke:#e1e4e8} .staff{stroke:#7c828c}"
)

GAP = 12  # between staff lines
# Half-gaps below the top line: where each drum's notehead sits.
POS = {"crash": -2, "hat": -1, "ride": 0, "tom.high": 1, "tom.low": 2, "snare": 3, "tom.floor": 5, "kick": 7, "pedal": 9}


def svg(w, h, title, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img">'
        f"<title>{html.escape(title)}</title>{style}"
        f'<rect class="card" x="0.5" y="0.5" width="{w - 1}" height="{h - 1}" rx="14"/>{body}</svg>\n'
    )


def staff(x1, x2, top):
    out = "".join(f'<path class="staff" d="M{x1} {top + i * GAP} H{x2}"/>' for i in range(5))
    # Percussion clef, and the bar lines at each end
    out += f'<rect class="ink" x="{x1 + 12}" y="{top + GAP}" width="4" height="{2 * GAP}"/>'
    out += f'<rect class="ink" x="{x1 + 20}" y="{top + GAP}" width="4" height="{2 * GAP}"/>'
    out += f'<path class="staff" d="M{x1} {top} V{top + 4 * GAP} M{x2} {top} V{top + 4 * GAP}"/>'
    return out


def head(cx, y, shape="dot"):
    if shape == "x":
        return f'<path class="pen" stroke-width="2" d="M{cx - 5.5} {y - 5.5} L{cx + 5.5} {y + 5.5} M{cx - 5.5} {y + 5.5} L{cx + 5.5} {y - 5.5}"/>'
    if shape == "diamond":
        return f'<path class="ink" d="M{cx - 7} {y} L{cx} {y - 6.5} L{cx + 7} {y} L{cx} {y + 6.5} Z"/>'
    return f'<ellipse class="ink" cx="{cx}" cy="{y}" rx="7" ry="5" transform="rotate(-20 {cx} {y})"/>'


def ledger(cx, y):
    return f'<path class="staff" d="M{cx - 12} {y} H{cx + 12}"/>'


def stem(cx, y, to):
    return f'<path class="pen" stroke-width="1.6" d="M{cx + 6.3} {y - 1} V{to}"/>'


def accent(cx, y):
    return f'<path class="pen" stroke-width="1.8" d="M{cx - 6} {y - 4} L{cx + 6} {y} L{cx - 6} {y + 4}"/>'


def parens(cx, y):
    return (
        f'<path class="pen" stroke-width="1.6" d="M{cx - 11} {y - 8} Q{cx - 16} {y} {cx - 11} {y + 8}"/>'
        f'<path class="pen" stroke-width="1.6" d="M{cx + 11} {y - 8} Q{cx + 16} {y} {cx + 11} {y + 8}"/>'
    )


def label(cx, y, name, cls="inst"):
    return f'<text class="m {cls}" x="{cx}" y="{y}" text-anchor="middle" style="font-size:13px">{html.escape(name)}</text>'


def note(cx, top, name, shape="dot", mark=None):
    y = top + POS[name] * GAP / 2
    out = ""
    if name == "crash":
        out += ledger(cx, y)
    out += head(cx, y, shape) + stem(cx, y, y - 38)
    if mark == "open":
        out += f'<circle class="pen" stroke-width="1.6" cx="{cx}" cy="{y - 50}" r="4.5"/>'
    if mark == "ghost":
        out += parens(cx, y)
    if mark == "rim":
        out += f'<path class="pen" stroke-width="1.8" d="M{cx - 10} {y + 7} L{cx + 10} {y - 7}"/>'
    if mark == "cross":
        out += f'<circle class="pen" stroke-width="1.6" cx="{cx}" cy="{y}" r="9"/>'
    if mark == "accent":
        out += accent(cx, y - 50)
    if mark == "double":
        out += f'<path class="pen" stroke-width="2.4" d="M{cx} {y - 18} L{cx + 13} {y - 25}"/>'
    return out


def drum_key():
    w, h, top = 968, 290, 132
    notes = [
        ("kick", "kick", "dot", None),
        ("snare", "snare", "dot", None),
        ("snare.ghost", "snare", "dot", "ghost"),
        ("snare.rim", "snare", "dot", "rim"),
        ("snare.cross", "snare", "x", "cross"),
        ("hat", "hat", "x", None),
        ("hat.open", "hat", "x", "open"),
        ("hat.pedal", "pedal", "x", None),
        ("ride", "ride", "x", None),
        ("ride.bell", "ride", "diamond", None),
        ("crash", "crash", "x", None),
        ("tom.high", "tom.high", "dot", None),
        ("tom.low", "tom.low", "dot", None),
        ("tom.floor", "tom.floor", "dot", None),
    ]
    body = '<text class="h" x="28" y="44">Where each drum sits on the staff</text>'
    body += '<text class="s dim" x="28" y="68">The name under each note is the name of its line in code.</text>'
    body += staff(28, 940, top)
    for i, (name, pos, shape, mark) in enumerate(notes):
        cx = 100 + i * 62
        body += note(cx, top, pos, shape, mark) + label(cx, 236 + (i % 2) * 24, name)
    return svg(w, h, "Drum key: the staff position and notehead of each drum, with its name in code", body)


def hit_key():
    w, h, top = 968, 284, 138
    hits = [
        ("x", "normal hit", None),
        ("^", "accent", "accent"),
        ("~", "ghost note", "ghost"),
        ("d", "double stroke", "double"),
        ("-", "nothing (a rest)", "rest"),
    ]
    body = '<text class="h" x="28" y="44">What each step character is on the page</text>'
    body += '<text class="s dim" x="28" y="68">Shown on the tom.high line. Every character lasts one sixteenth note.</text>'
    body += staff(28, 940, top)
    for i, (ch, words, mark) in enumerate(hits):
        cx = 150 + i * 170
        if mark == "rest":
            # A sixteenth rest: a slanted stroke with two flags
            y = top + 2 * GAP
            body += f'<path class="pen" stroke-width="1.8" d="M{cx + 5} {y - 12} L{cx - 3} {y + 14}"/>'
            for dy in (-9, 0):
                body += f'<circle class="ink" cx="{cx - 5}" cy="{y + dy}" r="2.6"/>'
                body += f'<path class="pen" stroke-width="1.6" d="M{cx - 5} {y + dy + 2} Q{cx} {y + dy + 3} {cx + 4 - (dy == 0) * 2.8} {y + dy - 2}"/>'
        else:
            body += note(cx, top, "tom.high", "dot", mark)
        body += label(cx, 240, ch, "step").replace("font-size:13px", "font-size:20px;font-weight:700")
        body += f'<text class="s dim" x="{cx}" y="260" text-anchor="middle" style="font-size:13px">{words}</text>'
    return svg(w, h, "The step characters x, ^, ~, d and - as an ordinary note, an accent, a ghost note, a double stroke and a rest", body)


def sheet_to_code():
    w, h, top = 968, 416, 160
    col = lambda i: 300 + i * 40
    hat = "x-x-x-x-x-x-x-x-"
    snare = "----^-------^---"
    kick = "x-------x-x-----"
    body = '<text class="h" x="28" y="44">One bar of sheet music, and the same bar in code</text>'
    body += '<text class="s dim" x="28" y="68">Each sixteenth note of the bar is one character. A character is under the note it plays.</text>'
    body += staff(28, 940, top)
    body += '<text class="s" x="60" y="%d" style="font-size:26px;font-weight:700">4</text><text class="s" x="60" y="%d" style="font-size:26px;font-weight:700">4</text>' % (top + 23, top + 47)
    beam = top - 46
    for i in range(16):
        cx = col(i)
        if i % 4 == 0:
            body += f'<path class="grid" d="M{cx - 20} {top + 62} V{top + 206}"/>'
        if hat[i] == "-":
            continue
        low = top + POS["hat"] * GAP / 2
        body += head(cx, low, "x")
        if snare[i] != "-":
            low = top + POS["snare"] * GAP / 2
            body += head(cx, low) + accent(cx, beam - 14)
        if kick[i] != "-":
            low = top + POS["kick"] * GAP / 2
            body += head(cx, low)
        body += stem(cx, low, beam)
        if i % 4 == 0:
            body += f'<path class="pen" stroke-width="5" stroke-linecap="butt" d="M{cx + 5.5} {beam + 2} H{col(i + 2) + 7.1}"/>'
    counts = "1e&a2e&a3e&a4e&a"
    for i, c in enumerate(counts):
        on = c.isdigit()
        body += f'<text class="m {"" if on else "mute"}" x="{col(i)}" y="{top + 82}" text-anchor="middle" style="font-size:13px;font-weight:{700 if on else 400}">{html.escape(c)}</text>'
    for r, (name, steps) in enumerate([("hat", hat), ("snare", snare), ("kick", kick)]):
        y = top + 122 + r * 34
        body += f'<rect class="code" x="20" y="{y - 21}" width="928" height="30" rx="6"/>'
        body += f'<text class="m" x="36" y="{y}" xml:space="preserve"><tspan class="inst">{name}</tspan><tspan class="p">:</tspan></text>'
        for i, c in enumerate(steps):
            body += f'<text class="m step" x="{col(i)}" y="{y}" text-anchor="middle" font-weight="{400 if c == "-" else 700}">{html.escape(c)}</text>'
    body += f'<text class="s dim" x="28" y="{h - 22}" style="font-size:13px">The snare on 2 and 4 carries an accent mark, so it is written ^. The same two lines as beats: snare: ^2 ^4 and kick: 1 3 3&amp;.</text>'
    return svg(w, h, "A rock beat on a drum staff above the same beat as hat, snare and kick lines, with each character under its note", body)


for name, make in [("drum-key", drum_key), ("hit-key", hit_key), ("sheet-to-code", sheet_to_code)]:
    (HERE / f"{name}.svg").write_text(make())
    print(f"{name}.svg")
