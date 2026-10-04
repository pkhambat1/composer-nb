"""Tab completion inside `%%music` cells.

Jupyter asks the kernel what could come next, and IPython only knows Python, so the
extension adds a matcher of its own. The word lists mirror dsl/js/language.js;
tests/python/test_completer.py fails if the two drift apart.
"""

import re
from typing import Dict, List, Optional, Tuple

from .song import Song

DRUMS = ["crash", "ride", "hat", "tom", "floor", "snare", "kick"]
VARIATIONS = {"ride": ["bell"], "hat": ["open", "pedal"], "snare": ["ghost", "rim"]}
INSTRUMENTS = ["piano", "epiano", "organ", "pad", "bass", "guitar"]
SETTINGS = ["time", "tempo", "sound", "key", "capo", "octave", "kit"]
TYPES = ["steps", "chords", "pattern"]
KITS = ["rock", "synth"]
UNITS = ["steps", "beats", "bars"]  # what a length on a drum's line is measured in

LANES = [lane for d in DRUMS for lane in [d, *(f"{d}.{v}" for v in VARIATIONS.get(d, []))]]
PARTS = ["chords", *LANES]
SETTING_VALUES = {"sound": INSTRUMENTS, "kit": KITS}

MAGIC = "%%music"
# A name and the type in front of it: steps pair = ^-x-
DEF_RE = re.compile(r"^\s*(steps|chords|pattern)\s+([A-Za-z_]\w*)\s*=", re.M)
# The instrument line the cursor is on: its name, then what's been written after the colon.
PART_RE = re.compile(r"(?:^|[\s{])([a-z]+(?:\.[a-z]+)?):([^:{}]*)$")
NUMBER_RE = re.compile(r"^\d+$|\)$")
# What makes a { a drum's block of steps: kick: in front of it, or steps name =
STEPS_OPENER_RE = re.compile(r"([a-z]+(?:\.[a-z]+)?)\s*:[^:{}]*$|^\s*steps\s+[A-Za-z_]\w*\s*=[^{}]*$")

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


def _open_blocks(text: str) -> List[Tuple[str, Optional[str]]]:
    """The blocks still open at the end of `text`: what each holds (a drum's "steps", or
    "lines"), and the name it's the value of, if any."""
    open_blocks: List[Tuple[str, Optional[str]]] = []
    for line in text.split("\n"):
        code = line.split("//")[0]
        for i, c in enumerate(code):
            if c == "{":
                opener = STEPS_OPENER_RE.search(code[:i])
                steps = (open_blocks and open_blocks[-1][0] == "steps") or bool(
                    opener and (opener.group(1) is None or opener.group(1) in LANES)
                )
                named = DEF_RE.match(code[:i])
                open_blocks.append(("steps" if steps else "lines", named and named.group(2)))
            elif c == "}" and open_blocks:
                open_blocks.pop()
    return open_blocks


def _sequence(words: List[str], patterns: List[Option], parts: List[Option]) -> List[Option]:
    """What can come next in a row of patterns, after the `words` already written."""
    if not words:
        return patterns + parts
    if NUMBER_RE.search(words[-1]):
        return [("bars ", "keyword")]  # a length, always plural: 3 bars groove
    return patterns


def _statement(head: str, body: str, names: Names) -> List[Option]:
    """What can come next on a line that isn't an instrument's."""
    inside = (body + head).count("{") > (body + head).count("}")
    words = re.sub(r"[()=]", lambda m: " = " if m.group() == "=" else " ", re.split(r"[{}]", head)[-1]).split()
    patterns = _options(names["pattern"], "variable")
    parts = _options([p + ": " for p in PARTS], "property")
    if not words:
        settings = _options([s + " " for s in SETTINGS], "keyword")
        types = _options([t + " " for t in TYPES], "keyword")
        if inside:
            return parts + patterns + [("bar ", "keyword"), ("every ", "keyword")] + settings + types
        return settings + types + [("play ", "keyword")]
    first = words[0]
    if first == "play":
        return _sequence(words[1:], patterns, parts)
    if first == "pattern" and words[2:4] == ["=", "every"]:
        words = words[3:]  # pattern feet = every 3 steps ...: a pattern at its own pace
        first = "every"
    if first == "every":
        # every 3 steps ...: how long a step lasts, then what plays at that pace
        if len(words) < 2:
            return []  # still writing the number
        if len(words) == 2:
            return _options([u + " " for u in UNITS], "keyword")
        return _sequence(words[3:], patterns, parts)
    if first == "bar":
        # bar 2 ..., bar 3 to 4 ...: a place, then what plays there
        if len(words) < 2:
            return []  # still writing the bar's number
        if len(words) == 2:
            return patterns + [("to ", "keyword")] + parts
        if words[2] == "to":
            return [] if len(words) < 4 else _sequence(words[4:], patterns, parts)
        return _sequence(words[2:], patterns, parts)
    if first in TYPES:
        if len(words) < 3 or words[2] != "=":
            return []  # still writing the name
        # After the =, what the type in front holds: steps pair = ^-x-
        if first == "pattern":
            return _sequence(words[3:], patterns, parts)
        return _options(names[first], "variable")
    if first == "time" and len(words) > 1 and "over" not in words:
        return [("over ", "keyword")]
    if first in SETTING_VALUES and len(words) == 1:
        return _options(SETTING_VALUES[first], "value")
    if inside and first not in SETTINGS:
        return _sequence(words, patterns, [])  # patterns to play in order: intro verse
    return []


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
    open_blocks = _open_blocks(body + head)
    unfinished = {name for _, name in open_blocks if name}
    names = {t: [n for n in found if n not in unfinished] for t, found in names.items()}

    variation = re.search(r"([a-z]+)\.$", head)
    part = PART_RE.search(head)
    if variation:  # ride. -> ride.bell
        options = _options([v + ": " for v in VARIATIONS.get(variation.group(1), [])], "property")
    elif part and part.group(1) in PARTS:
        # A drum's line takes steps, the chords line takes chords: only names of that type.
        holds = "chords" if part.group(1) == "chords" else "steps"
        options = _options(names[holds], "variable")
        written = part.group(2).replace(",", " , ").split()
        last = written[-1] if written else ""
        if holds == "steps" and NUMBER_RE.search(last):
            # 2 beats rest: a length, in front of what fills it. Or the line lists beats
            options = _options([u + " " for u in UNITS], "keyword")
        elif holds == "steps" and last in UNITS:
            options = [("rest", "keyword")] + options
        elif holds == "steps" and not any(w in UNITS for w in written):
            if any(w[0].isdigit() for w in written):
                options = []  # a line of beats holds only beats
    elif open_blocks and open_blocks[-1][0] == "steps":
        options = _options(names["steps"], "variable")  # a layer in a drum's block of steps
    else:
        options = _statement(head, body, names)
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
