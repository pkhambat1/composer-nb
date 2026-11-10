"""Tab completion inside `%%music` cells.

Jupyter asks the kernel what could come next, and IPython only knows Python, so the
extension adds a matcher of its own. The word lists mirror dsl/js/vocab.ts;
tests/python/test_completer.py fails if the two drift apart.
"""

import re
from typing import Dict, List, Optional, Tuple

from .song import Song

DRUMS = ["crash", "ride", "hat", "tom", "snare", "kick"]
VARIATIONS = {
    "ride": ["bell"],
    "hat": ["open", "pedal"],
    "tom": ["high", "low", "floor"],
    "snare": ["ghost", "rim", "cross"],
}
SPLIT = ["tom"]  # drums that are only their variations: tom is three drums
# Instruments that play notes and chords, each on a line of its own like a drum
PITCHED = ["guitar", "guitar.electric", "piano", "piano.electric", "organ", "bass"]
SETTINGS = ["time", "tempo", "swing", "key", "mode", "transpose", "octave", "kit"]
TYPES = ["steps", "notes", "chords", "pattern", "block"]
KITS = ["rock", "synth"]
SWING = ["on", "off"]
MODES = [
    "major",
    "minor",
    "dorian",
    "phrygian",
    "lydian",
    "mixolydian",
    "locrian",
    "harmonicMinor",
    "melodicMinor",
    "wholeTone",
]
INTERVALS = [
    "unison", "second", "third", "fourth", "fifth", "sixth", "seventh", "octave",
    "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth",
]
UNITS = ["steps", "beats", "bars"]  # what a length on a line is measured in

LANES = [
    lane
    for d in DRUMS
    for lane in [*([] if d in SPLIT else [d]), *(f"{d}.{v}" for v in VARIATIONS.get(d, []))]
]
PARTS = [*PITCHED, *LANES]
# What can follow an instrument's name and a dot: ride.bell, guitar.electric
SOUNDS = dict(VARIATIONS)
for _name in PITCHED:
    if "." in _name:
        SOUNDS.setdefault(_name.split(".")[0], []).append(_name.split(".")[1])
SETTING_VALUES = {"kit": KITS, "mode": MODES, "swing": SWING}
# Instruments with more than one sound, set like a setting: set guitar.electric muted
INSTRUMENT_SOUNDS = {"guitar.electric": ["clean", "muted"]}

MAGIC = "%%music"
# A name and the type in front of it: steps pair = ^-x-
DEF_RE = re.compile(rf"^\s*({'|'.join(TYPES)})\s+([A-Za-z_]\w*)\s*=", re.M)
# The instrument line the cursor is on: its name, then what's been written after the colon.
PART_RE = re.compile(r"(?:^|[\s{])([a-z]+(?:\.[a-z]+)?):([^:{}]*)$")
NUMBER_RE = re.compile(r"^\d+$|\)$")
# A length's arithmetic, (1+2)*2, as against a group of patterns, (verse chorus)
SUM_RE = re.compile(r"[\d\s./+*()-]*\d[\d\s./+*()-]*")
ARITHMETIC_RE = re.compile(r"[\d./+*-]*\d")
# What makes a { an instrument's block of layers: kick: or piano: in front of it, or
# steps name =
STEPS_OPENER_RE = re.compile(r"([a-z]+(?:\.[a-z]+)?)\s*:[^:{}]*$|^\s*steps\s+[A-Za-z_]\w*\s*=[^{}]*$")
# A with and its settings, in front of its block
WITH_RE = re.compile(r"\s*with\b[^{}]*")

Option = Tuple[str, str]  # the text to insert and its kind, which picks the icon
Names = Dict[str, List[str]]  # the names of each type


def _options(texts, kind) -> List[Option]:
    return [(t, kind) for t in texts]


def _magic_line(line: str, songs: Dict[str, Song]) -> Optional[Tuple[str, List[Option]]]:
    """Completions for the `%%music [name] [after <name>]` line itself."""
    if not line.startswith(MAGIC + " "):
        return None  # still typing the magic's name, which IPython completes
    fragment = re.search(r"\w*$", line).group()
    words = line[len(MAGIC) : len(line) - len(fragment)].split()
    if words and words[-1] == "after":
        return fragment, _options(sorted(songs), "variable")
    if len(words) == 1:
        return fragment, [("after ", "keyword")]
    return fragment, []


def _names(defined: str) -> Names:
    """The names given in `defined`, by the type written in front of them."""
    types = {}
    for type_, name in DEF_RE.findall(defined):
        types[name] = type_  # a name given again means the new thing
    return {t: sorted(n for n, given in types.items() if given == t) for t in TYPES}


def _open_blocks(text: str) -> Tuple[List[Tuple[str, Optional[str]]], Optional[str]]:
    """The blocks still open at the end of `text`: what each holds (a drum's "steps", a
    pitched instrument's "layers", a with's "statements" at the top of a cell, or "lines"),
    and the name it's the value of, if any. Also what the block the last } closed held."""
    open_blocks: List[Tuple[str, Optional[str]]] = []
    closed = None
    for line in text.split("\n"):
        code = line.split("//")[0]
        for i, c in enumerate(code):
            if c == "{":
                opener = STEPS_OPENER_RE.search(code[:i])
                holds = "lines"
                if open_blocks and open_blocks[-1][0] in ("steps", "layers"):
                    holds = open_blocks[-1][0]
                elif opener and (opener.group(1) is None or opener.group(1) in LANES):
                    holds = "steps"
                elif opener and opener.group(1) in PITCHED:
                    holds = "layers"
                elif WITH_RE.fullmatch(code[:i]) and all(h == "statements" for h, _ in open_blocks):
                    holds = "statements"  # a with at the top holds statements, as a cell does
                named = DEF_RE.match(code[:i])
                open_blocks.append((holds, named and named.group(2)))
            elif c == "}":
                closed = open_blocks.pop()[0] if open_blocks else None
    return open_blocks, closed


def _pitched(written: List[str], names: Names) -> List[Option]:
    """What can come next on a pitched instrument's line: notes or chords, the word that says
    which, and then its value. Notes use step words and finite repeats: C2 7*-, 2*riff."""
    functions = _options([name + "(" for name in INTERVALS], "function")
    notes = _options(names["notes"], "variable") + functions
    if not written:
        return [("notes ", "keyword"), ("chords ", "keyword")]
    last = written[-1]
    if written[0] == "chords":  # the word in front is what makes a line a chart
        return _options(names["chords"], "variable") + functions
    if written[0] != "notes":
        return []
    if len(written) == 1:
        return notes
    if last.endswith("*"):
        return [("-", "value"), ("_", "value")] + notes
    return notes


def _group_closed(text: str) -> bool:
    """Whether `text` ends with a ) that closes a group of patterns, (verse chorus), and
    not a length's arithmetic, (1+2)."""
    depth = 0
    for i in range(len(text) - 1, -1, -1):
        if text[i] == ")":
            depth += 1
        elif text[i] == "(":
            depth -= 1
            if depth == 0:
                return not SUM_RE.fullmatch(text[i + 1 : -1])
    return False


def _groups(text: str) -> int:
    """How many groups ( ) are open at the end of `text`. A length's arithmetic, (1+2),
    closes on its own line, so it nets out."""
    code = "\n".join(line.split("//")[0] for line in text.split("\n"))
    return max(0, code.count("(") - code.count(")"))


# Braces that are a value say their type: pattern { ... }, block { ... }
TYPED_BRACES: List[Option] = [("pattern ", "keyword"), ("block ", "keyword")]


def _sequence(
    words: List[str], patterns: List[Option], parts: List[Option], grouped: bool = False
) -> List[Option]:
    """What can come next where something plays, after the `words` already written. A line
    plays one thing; in a group ( ) things play in order, so more can follow there."""
    if not words:
        return patterns + parts
    last = words[-1]
    if NUMBER_RE.search(last) or ARITHMETIC_RE.fullmatch(last):
        return [("bars ", "keyword")]  # a length, always plural: 3 bars groove
    if last == "bars":
        return patterns + TYPED_BRACES  # a length is followed by what it measures
    return patterns + TYPED_BRACES if grouped else []


def _statement(
    head: str, body: str, names: Names, closed: Optional[str] = None
) -> List[Option]:
    """What can come next on a line that isn't an instrument's. `closed` is what the block
    the last } closed held."""
    if re.search(r"\bon\s+bar\s+\d+(?:\s+to\s+\d+)?\s*$", head):
        return []
    pitched = re.match(r"\s*(notes|chords)\s+[A-Za-z][A-Za-z0-9]*\s*=\s*(.*)$", head)
    if pitched:
        return _pitched([pitched.group(1), *pitched.group(2).split()], names)
    # At the top of a cell or of a with there, statements; in any other block, lines
    blocks, _ = _open_blocks(body + head)
    inside = not all(h == "statements" for h, _ in blocks)
    grouped = _groups(body + head) > 0  # in a group, what plays in order goes on
    tail = head.rstrip()
    patterns = _options(names["pattern"] + names["block"], "variable")
    # After a block or a group, more follows only inside a group. A kit piece's or an
    # instrument's block is the whole of its line, so nothing goes beside it.
    if tail.endswith("}"):
        return patterns + TYPED_BRACES if closed == "lines" and grouped else []
    if tail.endswith(")") and _group_closed(tail):
        return patterns + TYPED_BRACES if grouped else []
    segment = re.split(r"[{}]", head)[-1]
    words = re.sub(r"[()=]", lambda m: " = " if m.group() == "=" else " ", segment).split()
    parts = _options([p + ": " for p in PARTS], "property")
    if not words:
        if grouped:
            # the next thing in a group
            return patterns + parts + TYPED_BRACES + [("with ", "keyword")]
        types = _options([t + " " for t in TYPES], "keyword")
        if inside:
            # in braces, settings go on a with: with octave 2 { ... }
            return parts + patterns + [("every ", "keyword"), ("with ", "keyword")] + types
        # set only at the top of the cell: in a with, settings go on a with
        settings = [] if blocks else [("set ", "keyword")]
        return settings + types + [("play ", "keyword"), ("print(", "function"), ("with ", "keyword")]
    first = words[0]
    if first == "print":
        kinds = [kind for kind in ("notes", "chords", "steps") if kind in words[1:]]
        options = _options([name for kind in (kinds or ["notes", "chords", "steps"]) for name in names[kind]], "variable")
        if kinds != ["steps"]:
            options += _options([name + "(" for name in INTERVALS], "function")
        if not kinds:
            options += _options([kind + " " for kind in ("notes", "chords", "steps")], "keyword")
        return options
    if tail.endswith("("):
        # a group starts: what plays in order
        return patterns + parts + TYPED_BRACES + [("with ", "keyword")]
    if first == "play":
        if grouped:
            return _sequence(words[1:], patterns, parts, grouped)
        if len(words) == 1:
            return patterns + parts + TYPED_BRACES
        if len(words) == 2 and words[1] in names["pattern"] + names["block"]:
            return [("for ", "keyword"), ("on bar ", "keyword")]
        return []
    if first in ("pattern", "block") and words[2:4] == ["=", "every"]:
        words = words[3:]  # pattern feet = every 3/4 beats ...: a pattern at its own pace
        first = "every"
    if first == "every":
        # every 3/4 beats ...: how long a step lasts, then what plays at that pace
        if len(words) < 2:
            return []  # still writing the number
        if len(words) == 2:
            return [("beats ", "keyword")]
        return _sequence(words[3:], patterns, parts, grouped)
    if len(words) >= 2 and words[-2:] == ["on", "bar"]:
        return []  # the user supplies the bar number
    if words[-1] == "on":
        return [("bar ", "keyword")]
    if first in TYPES:
        if len(words) < 3 or words[2] != "=":
            return []  # still writing the name
        # After the =, what the type in front holds: steps pair = ^-x-
        if first in ("pattern", "block"):
            return _sequence(words[3:], patterns, parts, grouped)
        return _options(names[first], "variable")
    if first == "set":
        # set tempo 90, set key E, set guitar.electric muted: a setting and its value
        if len(words) == 1:
            return _options([s + " " for s in SETTINGS] + [i + " " for i in INSTRUMENT_SOUNDS], "keyword")
        return _setting(words[1:])
    if first == "with":
        # with key E, mode minor { ... }: settings with commas between them, then a block
        setting = segment.split(",")[-1].split()
        if setting[:1] == ["with"]:
            setting = setting[1:]
        if not setting:
            return _options([s + " " for s in SETTINGS] + [i + " " for i in INSTRUMENT_SOUNDS], "keyword")
        return _setting(setting)
    if (inside or grouped) and first not in SETTINGS:
        return _sequence(words, patterns, [], grouped)  # a pattern to play, or a group
    return []


def _setting(words: List[str]) -> List[Option]:
    """What can come next after set and a setting's name."""
    first = words[0]
    if first in INSTRUMENT_SOUNDS and len(words) == 1:
        return _options(INSTRUMENT_SOUNDS[first], "value")
    if first == "time" and len(words) > 1 and "over" not in words:
        return [("over ", "keyword")]
    if first in SETTING_VALUES and len(words) == 1:
        return _options(SETTING_VALUES[first], "value")
    return []


def _entry_context(text: str) -> Tuple[str, str]:
    """Separate the current brace entry from its context. Parentheses and with headers
    retain their argument/setting commas, just as in the JavaScript lexer."""
    code = re.sub(r"//[^\n]*", lambda m: " " * len(m.group()), text)
    levels = [{"start": 0, "parens": 0, "head": ""}]
    for i, c in enumerate(code):
        level = levels[-1]
        if c == "{":
            level["head"] = ""
            levels.append({"start": i + 1, "parens": 0, "head": ""})
        elif c == "}":
            if len(levels) > 1:
                levels.pop()
        elif c == ";" or (c == "," and len(levels) > 1 and not level["parens"]
                          and not re.search(r"\bwith(?:\s|$)", level["head"])):
            level.update(start=i + 1, head="")
        elif c == "\n" and len(levels) == 1 and not level["parens"]:
            level.update(start=i + 1, head="")
        elif c == "\n" and level["parens"] and not re.search(r"\b(?:notes|chords|with)\b", level["head"]):
            # A pattern group can start another part on a new line. Keep its
            # opening parenthesis in the context for _groups().
            level["start"] = i + 1
        else:
            if c == "(":
                level["parens"] += 1
            elif c == ")":
                level["parens"] = max(0, level["parens"] - 1)
            level["head"] += c
    start = levels[-1]["start"]
    return code[:start], code[start:]


def complete(text: str, cursor: int, songs: Optional[Dict[str, Song]] = None):
    """Completions at `cursor` in a `%%music` cell (`text` includes the magic line).

    Returns (fragment, options): the part of a word already typed, and what could
    replace it. None means the cursor isn't somewhere this language applies.
    """
    songs = songs or {}
    before = text[:cursor]
    start = before.rfind("\n") + 1
    line = before[start:]
    if start == 0:
        return _magic_line(line, songs)
    if "//" in line:
        return "", []
    fragment = re.search(r"[A-Za-z_]\w*$|$", line).group()
    head = line[: len(line) - len(fragment)]
    magic_line, _, body = before[:start].partition("\n")

    # Names defined above the cursor, in this cell or the cells it continues from.
    after = re.search(r"\bafter\s+(\w+)", magic_line)
    inherited = songs[after.group(1)].chain if after and after.group(1) in songs else []
    names = _names("\n".join([*inherited, body]))
    # A name isn't defined until its braces close.
    open_blocks, closed = _open_blocks(body + head)
    body, head = _entry_context(body + head)
    unfinished = {name for _, name in open_blocks if name}
    names = {t: [n for n in found if n not in unfinished] for t, found in names.items()}

    duration = re.search(r"\bfor\s+(.*)$", head)
    if duration and (head.lstrip().startswith("play ") or re.match(r"^\s*[})]", head)):
        written = duration.group(1).split()
        options = [("bars ", "keyword")] if len(written) == 1 and (NUMBER_RE.search(written[0]) or ARITHMETIC_RE.fullmatch(written[0])) else []
        return fragment, [o for o in options if o[0].startswith(fragment) and o[0] != fragment]

    variation = re.search(r"([a-z]+)\.$", head)
    part = PART_RE.search(head)
    if variation:  # ride. -> ride.bell, guitar. -> guitar.electric
        options = _options([v + ": " for v in SOUNDS.get(variation.group(1), [])], "property")
    elif part and part.group(1) in PITCHED:
        options = _pitched(part.group(2).split(), names)
    elif part and part.group(1) in PARTS:
        # A drum's line takes steps: only names of steps.
        holds = "steps"
        options = _options(names[holds], "variable")
    elif open_blocks and open_blocks[-1][0] == "steps":
        options = _options(names["steps"], "variable")  # a layer in a drum's block of steps
    elif open_blocks and open_blocks[-1][0] == "layers":
        options = _pitched(head.split(), names)  # a layer in a pitched instrument's block
    else:
        options = _statement(head, body, names, closed)
    return fragment, [o for o in options if o[0].startswith(fragment) and o[0] != fragment]


def register(shell) -> None:
    """Add the `%%music` matcher to `shell`'s completer, once."""
    try:
        from IPython.core.completer import SimpleCompletion, context_matcher
    except ImportError:  # IPython before 8.6 has no matcher API
        return
    identifier = "composer_nb.music_matcher"
    matchers = shell.Completer.custom_matchers
    if any(getattr(m, "matcher_identifier", None) == identifier for m in matchers):
        return

    @context_matcher(identifier=identifier)
    def music_matcher(context):
        text = context.full_text
        result = None
        if text.startswith(MAGIC):
            lines = text.split("\n")
            cursor = sum(len(l) + 1 for l in lines[: context.cursor_line]) + context.cursor_position
            songs = {k: v for k, v in shell.user_ns.items() if isinstance(v, Song)}
            result = complete(text, cursor, songs)
        if result is None:
            return {"completions": [], "suppress": False}
        fragment, options = result
        return {
            "completions": [SimpleCompletion(text=t, type=kind) for t, kind in options],
            "matched_fragment": fragment,
            # Python names mean nothing in a music cell, so IPython's own matchers stay out.
            "suppress": True,
        }

    matchers.append(music_matcher)

    # IPython ignores suppress when a matcher has nothing to offer, so a spot with no music
    # completions (tempo |) would fall back to Python names. Drop the other matchers' results
    # there too. _complete is private, so if it isn't there, keep IPython's behaviour.
    completer = shell.Completer
    original = getattr(completer, "_complete", None)
    if original is None:
        return

    def _complete(**kwargs):
        results = original(**kwargs)
        ours = results.get(identifier)
        if ours and ours.get("suppress"):
            return {identifier: ours}
        return results

    completer._complete = _complete
