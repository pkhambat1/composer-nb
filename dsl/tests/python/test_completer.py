import json
import re
from pathlib import Path

import pytest
from IPython.core.completer import provisionalcompleter
from IPython.core.interactiveshell import InteractiveShell

from composer_nb import Song, completer
from composer_nb.completer import complete

LANGUAGE_JS = Path(__file__).parents[2] / "js" / "language.js"


def texts(cell, songs=None):
    """What's offered with the cursor at the end of `cell`."""
    return [t for t, _ in complete(cell, len(cell), songs)[1]]


@pytest.mark.parametrize(
    "name", ["DRUMS", "VARIATIONS", "SPLIT", "PITCHED", "SETTINGS", "TYPES", "KITS", "UNITS"]
)
def test_words_match_the_language(name):
    # One line, or an object or a list over several lines up to its closing bracket
    found = re.search(
        rf"^export const {name} = (\{{[^}}]*\}}|\[[^\]]*\]|.+)$", LANGUAGE_JS.read_text(), re.M
    )
    literal = re.sub(r",(\s*[}\]])", r"\1", found.group(1))  # no trailing commas in JSON
    assert getattr(completer, name) == json.loads(re.sub(r"(\w+):", r'"\1":', literal))


def test_a_drum_and_a_dot_offers_its_other_sounds():
    assert texts("%%music\nplay {\n  ride.") == ["bell: "]
    assert texts("%%music\nplay {\n  hat.") == ["open: ", "pedal: "]
    assert texts("%%music\nplay {\n  hat.p") == ["pedal: "]
    assert texts("%%music\nplay {\n  snare.") == ["ghost: ", "rim: "]
    assert texts("%%music\nplay {\n  tom.") == ["high: ", "low: ", "floor: "]
    assert texts("%%music\nplay {\n  kick.") == []


def test_a_pitched_instrument_and_a_dot_offers_its_other_sound():
    assert texts("%%music\nplay {\n  guitar.") == ["electric: "]
    assert texts("%%music\nplay {\n  piano.") == ["electric: "]
    assert texts("%%music\nplay {\n  organ.") == []


def test_tom_is_only_its_three_drums():
    cell = "%%music\nplay {\n  "
    assert texts(cell + "to") == ["tom.high: ", "tom.low: ", "tom.floor: "]
    assert texts(cell + "fl") == []


def test_top_of_a_cell_offers_settings_types_and_play():
    assert texts("%%music\nt") == ["time ", "tempo "]
    assert texts("%%music\np") == ["pattern ", "play "]
    assert texts("%%music\ns") == ["steps "]  # no sound: the instrument is the line's name
    assert texts("%%music\nn") == ["notes "]
    assert texts("%%music\nc") == ["capo ", "chords "]
    assert "kick: " not in texts("%%music\n")


def test_inside_braces_offers_instruments_and_patterns():
    cell = "%%music\npattern groove = { kick: x--x }\nplay {\n  "
    assert {"kick: ", "ride.bell: ", "piano: ", "groove", "tempo ", "steps "} <= set(texts(cell))
    assert "chords: " not in texts(cell)  # chords go on their instrument's line
    assert texts(cell + "ri") == ["ride: ", "ride.bell: "]
    assert texts(cell + "gu") == ["guitar: ", "guitar.electric: "]
    assert texts(cell + "l") == []  # no loop: a pattern repeats by itself
    assert texts(cell + "groove g") == ["groove"]


def test_settings_offer_their_values():
    assert texts("%%music\nkit ") == completer.KITS
    assert texts("%%music\nkit s") == ["synth"]
    assert texts("%%music\ntime 7 ") == ["over "]
    assert texts("%%music\ntempo ") == []


def test_instrument_lines_offer_names_of_their_type():
    cell = "%%music\nsteps pair = ^-x-\nnotes riff = F---G---\nchords verse = Am F\nplay {\n  "
    assert texts(cell + "hat: ") == ["pair"]
    assert texts(cell + "hat: p") == ["pair"]
    assert texts(cell + "snare: 2 4 p") == []  # a line of beats holds only beats
    # a length in front of what fills it: 2 beats rest
    assert texts(cell + "snare: 2 ") == ["steps ", "beats ", "bars "]
    assert texts(cell + "snare: 2 b") == ["beats ", "bars "]
    assert texts(cell + "snare: 2 beats ") == ["rest", "pair"]
    assert texts(cell + "snare: 2 beats rest, ") == ["pair"]
    # A pitched instrument's line is notes, or a chart with chords in front of it.
    assert texts(cell + "piano: ") == ["chords ", "riff"]
    assert texts(cell + "piano: c") == ["chords "]
    assert texts(cell + "piano: chords ") == ["verse"]
    assert texts(cell + "piano: chords Am ") == ["verse"]
    assert texts(cell + "guitar.electric: F--- ") == ["riff"]
    # A name only goes where its type goes.
    assert texts(cell + "hat: v") == []
    assert texts(cell + "hat: r") == []
    assert texts(cell + "piano: v") == []
    assert texts(cell + "piano: chords p") == []
    assert texts(cell + "piano: chords r") == []


def test_a_drums_block_offers_names_of_steps():
    cell = "%%music\nsteps pair = ^-x-\nchords verse = Am F\npattern groove = {\n  snare.ghost: {\n    "
    assert texts(cell) == ["pair"]
    assert texts(cell + "p") == ["pair"]
    assert texts(cell + "--x-\n    {\n      ") == ["pair"]  # a block inside it holds steps too
    assert "kick: " in texts(cell + "--x-\n  }\n  ")  # closed: back to the pattern's lines
    assert texts("%%music\nsteps pair = ^-x-\nsteps ghosts = {\n  ") == ["pair"]
    assert texts("%%music\nsteps pair = ^-x-\nplay hat: x--- {\n  ") == ["pair"]


def test_a_pitched_instruments_block_offers_notes_and_chords():
    cell = "%%music\nsteps pair = ^-x-\nnotes riff = F---G---\nchords verse = Am F\nplay piano: {\n  "
    assert texts(cell) == ["chords ", "riff"]
    assert texts(cell + "chords ") == ["verse"]
    assert texts(cell + "C4--- ") == ["riff"]
    assert "kick: " in texts("%%music\nplay {\n  piano: {\n    C4---\n  }\n  ")  # closed


def test_a_name_is_not_offered_inside_its_own_braces():
    assert "groove" not in texts("%%music\npattern groove = {\n  ")
    assert "groove" in texts("%%music\npattern groove = {\n  kick: x\n}\nplay ")


def test_a_bar_offers_what_can_play_there():
    cell = "%%music\nsteps pair = x-x-\npattern lift = { hat.pedal: 4 }\npattern groove = {\n  "
    assert "bar " in texts(cell)
    assert texts(cell + "ba") == ["bass: ", "bar "]
    assert texts(cell + "bar") == ["bar "]
    assert texts(cell + "bar ") == []  # the bar's number
    assert texts(cell + "bar 2 ") == ["lift", "to ", *[p + ": " for p in completer.PARTS]]
    assert texts(cell + "bar 2 hat.") == ["open: ", "pedal: "]
    assert texts(cell + "bar 2 hat: ") == ["pair"]
    assert texts(cell + "bar 3 to ") == []  # the last bar's number
    assert texts(cell + "bar 3 to 4 l") == ["lift"]


def test_every_offers_units_then_what_plays():
    cell = "%%music\nsteps pair = x-x-\npattern lift = { hat.pedal: 4 }\npattern groove = {\n  "
    assert "every " in texts(cell)
    assert texts(cell + "ev") == ["every "]
    assert texts(cell + "every ") == []  # the number
    assert texts(cell + "every 3 ") == ["steps ", "beats ", "bars "]
    assert texts(cell + "every 3 steps ") == ["lift", *[p + ": " for p in completer.PARTS]]
    assert texts(cell + "every 3 steps kick: ") == ["pair"]
    assert texts("%%music\npattern feet = every 3 ") == ["steps ", "beats ", "bars "]


def test_play_offers_patterns_and_lengths():
    cell = "%%music\nsteps pair = x-x-\npattern groove = { kick: x--x }\n"
    assert texts(cell + "play ") == ["groove", *[p + ": " for p in completer.PARTS]]
    assert texts(cell + "play 3 ") == ["bars "]
    assert texts(cell + "play 3 bars ") == ["groove"]
    assert texts(cell + "play 3 bars (groove g") == ["groove"]


def test_a_type_offers_what_it_holds_after_the_equals():
    cell = "%%music\nsteps pair = ^-x-\nnotes riff = F---\nchords verse = Am F\npattern hit = { crash: 1 }\n"
    assert texts(cell + "steps ") == []  # still writing the name
    assert texts(cell + "steps four = ") == ["pair"]
    assert texts(cell + "notes line = ") == ["riff"]
    assert texts(cell + "chords song = ") == ["verse"]
    assert texts(cell + "pattern outro = ") == ["hit", *[p + ": " for p in completer.PARTS]]
    assert texts(cell + "pattern outro = 2 ") == ["bars "]
    assert texts(cell + "pattern outro = 2 bars h") == ["hit"]
    assert texts(cell + "pattern outro = hit h") == ["hit"]
    assert texts(cell + "pattern fill = snare: ") == ["pair"]


def test_a_name_given_again_means_the_new_thing():
    cell = "%%music\nsteps riff = x-x-\nchords riff = Am F\nplay {\n  "
    assert texts(cell + "piano: chords ") == ["riff"]
    assert texts(cell + "hat: ") == []


def test_names_without_a_type_are_not_names_yet():
    assert texts("%%music\ngroove = { kick: x }\nplay gr") == []


def test_names_defined_below_the_cursor_are_not_offered():
    cell = "%%music\nplay \npattern later = { kick: x }"
    assert "later" not in [t for t, _ in complete(cell, len("%%music\nplay "))[1]]


def test_comments_offer_nothing():
    assert texts("%%music\n// t") == []


def test_magic_line_offers_after_and_saved_songs():
    songs = {"intro": Song("tempo 75", name="intro")}
    assert complete("%%mus", 5) is None
    assert texts("%%music verse ", songs) == ["after "]
    assert texts("%%music verse after ", songs) == ["intro"]


def test_names_carry_on_from_the_song_a_cell_continues():
    songs = {"intro": Song("chords riff = Am E7|G D\npattern groove = { kick: x--x }", name="intro")}
    assert texts("%%music verse after intro\nplay piano: chords ", songs) == ["riff"]
    assert "groove" in texts("%%music verse after intro\nplay ", songs)


@pytest.fixture
def shell():
    shell = InteractiveShell.instance()
    shell.run_line_magic("load_ext", "composer_nb")
    shell.run_line_magic("reload_ext", "composer_nb")  # loading twice mustn't add two matchers
    yield shell
    shell.user_ns.pop("intro", None)


def kernel_completions(shell, cell):
    """What the Jupyter kernel answers when Tab is pressed at the end of `cell`."""
    with provisionalcompleter():
        return [(cell[c.start : c.end], c.text) for c in shell.Completer.completions(cell, len(cell))]


def test_ipython_completes_music_cells(shell):
    assert kernel_completions(shell, "%%music\nplay {\n  ride.") == [("", "bell: ")]
    assert sorted(kernel_completions(shell, "%%music\nplay {\n  sn")) == [
        ("sn", "snare.ghost: "),
        ("sn", "snare.rim: "),
        ("sn", "snare: "),
    ]
    shell.run_cell_magic("music", "intro", "tempo 75")
    assert kernel_completions(shell, "%%music verse after in") == [("in", "intro")]


def test_ipython_keeps_python_names_out_of_music_cells(shell):
    # pass and print would be here too if IPython's own matchers ran.
    assert kernel_completions(shell, "%%music\np") == [("p", "pattern "), ("p", "play ")]


@pytest.mark.parametrize("cell", ["%%music\ntempo ", "%%music\nplay {\n  kick: x--- ", "%%music\n// i"])
def test_ipython_offers_nothing_where_music_has_nothing(shell, cell):
    assert kernel_completions(shell, cell) == []


def test_ipython_still_completes_the_magic_name(shell):
    assert ("%%mus", "%%music") in kernel_completions(shell, "%%mus")


def test_python_cells_are_left_alone(shell):
    assert ("pri", "print") in kernel_completions(shell, "pri")
