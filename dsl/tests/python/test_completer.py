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
    "name", ["DRUMS", "VARIATIONS", "INSTRUMENTS", "SETTINGS", "TYPES", "MODIFIERS", "KITS"]
)
def test_words_match_the_language(name):
    literal = re.search(rf"^export const {name} = (.+)$", LANGUAGE_JS.read_text(), re.M).group(1)
    assert getattr(completer, name) == json.loads(re.sub(r"(\w+):", r'"\1":', literal))


def test_a_drum_and_a_dot_offers_its_other_sounds():
    assert texts("%%music\nplay {\n  ride.") == ["bell: "]
    assert texts("%%music\nplay {\n  hat.") == ["open: ", "pedal: "]
    assert texts("%%music\nplay {\n  hat.p") == ["pedal: "]
    assert texts("%%music\nplay {\n  snare.") == ["ghost: ", "rim: "]
    assert texts("%%music\nplay {\n  kick.") == []


def test_top_of_a_cell_offers_settings_types_and_play():
    assert texts("%%music\nt") == ["time ", "tempo "]
    assert texts("%%music\np") == ["pattern ", "play "]
    assert texts("%%music\ns") == ["step ", "sound ", "steps "]
    assert texts("%%music\nc") == ["capo ", "chords "]
    assert "kick: " not in texts("%%music\n")
    assert "loop " not in texts("%%music\n")


def test_inside_braces_offers_instruments_patterns_and_loop():
    cell = "%%music\npattern groove = { kick: x--x }\nplay {\n  "
    assert {"kick: ", "ride.bell: ", "chords: ", "groove", "loop ", "tempo ", "steps "} <= set(texts(cell))
    assert texts(cell + "ri") == ["ride: ", "ride.bell: "]
    assert texts(cell + "l") == ["loop "]
    assert texts(cell + "loop g") == ["groove"]
    assert texts(cell + "groove g") == ["groove"]


def test_settings_offer_their_values():
    assert texts("%%music\nsound ") == completer.INSTRUMENTS
    assert texts("%%music\nkit s") == ["synth"]
    assert texts("%%music\ntime 7 ") == ["over "]
    assert texts("%%music\ntempo ") == []


def test_instrument_lines_offer_loop_and_names_of_their_type():
    cell = "%%music\nsteps pair = X-x-\nchords verse = Am F\nplay {\n  "
    assert texts(cell + "hat: ") == ["loop ", "pair"]
    assert texts(cell + "hat: loop p") == ["pair"]
    assert texts(cell + "snare: 2 4 a") == ["accent"]
    assert texts(cell + "chords: ") == ["loop ", "verse"]
    assert texts(cell + "chords: Am ") == ["verse"]
    # A name only goes where its type goes.
    assert texts(cell + "hat: v") == []
    assert texts(cell + "chords: p") == []


def test_play_offers_patterns_lengths_and_loop():
    cell = "%%music\nsteps pair = x-x-\npattern groove = { kick: x--x }\n"
    assert texts(cell + "play ") == ["groove", "loop ", *[p + ": " for p in completer.PARTS]]
    assert texts(cell + "play 3 ") == ["bars ", "bar "]
    assert texts(cell + "play 3 bars ") == ["loop ", "groove"]
    assert texts(cell + "play 3 bars loop ") == ["groove"]
    assert texts(cell + "play 3 bars loop (groove g") == ["groove"]


def test_a_type_offers_what_it_holds_after_the_equals():
    cell = "%%music\nsteps pair = X-x-\nchords verse = Am F\npattern hit = { crash: 1 }\n"
    assert texts(cell + "steps ") == []  # still writing the name
    assert texts(cell + "steps four = ") == ["pair"]
    assert texts(cell + "chords song = ") == ["verse"]
    assert texts(cell + "pattern outro = ") == ["hit", "loop ", *[p + ": " for p in completer.PARTS]]
    assert texts(cell + "pattern outro = 2 ") == ["bars ", "bar "]
    assert texts(cell + "pattern outro = 2 bars l") == ["loop "]
    assert texts(cell + "pattern outro = hit h") == ["hit"]
    assert texts(cell + "pattern fill = snare: ") == ["loop ", "pair"]


def test_a_name_given_again_means_the_new_thing():
    cell = "%%music\nsteps riff = x-x-\nchords riff = Am F\nplay {\n  "
    assert texts(cell + "chords: ") == ["loop ", "riff"]
    assert texts(cell + "hat: ") == ["loop "]


def test_names_without_a_type_are_not_names_yet():
    assert texts("%%music\ngroove = { kick: x }\nplay g") == []


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
    assert texts("%%music verse after intro\nplay chords: ", songs) == ["loop ", "riff"]
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
