import json
import re
from pathlib import Path

import pytest
from IPython.core.completer import provisionalcompleter
from IPython.core.interactiveshell import InteractiveShell

from composer_nb import Song, completer
from composer_nb.completer import complete

VOCAB_TS = Path(__file__).parents[2] / "js" / "vocab.ts"

# What can follow in a group: a name, or braces with their type
MORE = ["groove", "pattern ", "block "]
FUNCTIONS = [name + "(" for name in completer.INTERVALS]


def texts(cell, songs=None):
    """What's offered with the cursor at the end of `cell`."""
    return [t for t, _ in complete(cell, len(cell), songs)[1]]


@pytest.mark.parametrize(
    "name",
    ["DRUMS", "VARIATIONS", "SPLIT", "PITCHED", "SETTINGS", "TYPES", "KITS", "SWING", "UNITS"],
)
def test_words_match_the_language(name):
    # One line, or an object or a list over several lines up to its closing bracket, after
    # any type the constant is given and before any `as const`
    found = re.search(
        rf"^export const {name}(?::[^=]*)? = (\{{[^}}]*\}}|\[[^\]]*\]|.+?)(?: as const)?$",
        VOCAB_TS.read_text(),
        re.M,
    )
    literal = re.sub(r",(\s*[}\]])", r"\1", found.group(1))  # no trailing commas in JSON
    assert getattr(completer, name) == json.loads(re.sub(r"(\w+):", r'"\1":', literal))


def test_modes_match_the_language():
    # The modes are the keys of the table in vocab.ts: one entry each, at two spaces' indent
    table = re.search(r"^export const MODE_TABLE = \{\n(.*?)^\}", VOCAB_TS.read_text(), re.M | re.S)
    assert completer.MODES == re.findall(r"^  (\w+): \{", table.group(1), re.M)


def test_every_type_declares_a_name():
    for type_ in completer.TYPES:
        assert completer.DEF_RE.match(f"{type_} fig = x") is not None, type_


def test_a_drum_and_a_dot_offers_its_other_sounds():
    assert texts("%%music\nplay block {\n  ride.") == ["bell: "]
    assert texts("%%music\nplay block {\n  hat.") == ["open: ", "pedal: "]
    assert texts("%%music\nplay block {\n  hat.p") == ["pedal: "]
    assert texts("%%music\nplay block {\n  snare.") == ["ghost: ", "rim: ", "cross: "]
    assert texts("%%music\nplay block {\n  tom.") == ["high: ", "low: ", "floor: "]
    assert texts("%%music\nplay block {\n  kick.") == []


def test_a_pitched_instrument_and_a_dot_offers_its_other_sound():
    assert texts("%%music\nplay block {\n  guitar.") == ["electric: "]
    assert texts("%%music\nplay block {\n  piano.") == ["electric: "]
    assert texts("%%music\nplay block {\n  organ.") == []


def test_tom_is_only_its_three_drums():
    cell = "%%music\nplay block {\n  "
    assert texts(cell + "to") == ["tom.high: ", "tom.low: ", "tom.floor: "]
    assert texts(cell + "fl") == []


def test_top_of_a_cell_offers_set_types_play_and_with():
    assert texts("%%music\np") == ["pattern ", "play ", "print("]
    assert texts("%%music\nw") == ["with "]
    assert texts("%%music\ns") == ["set ", "steps "]
    assert texts("%%music\nn") == ["notes "]
    assert texts("%%music\nc") == ["chords "]
    assert texts("%%music\nt") == []  # a setting comes after set
    assert "kick: " not in texts("%%music\n")
    # after set, the settings, and the instruments with more than one sound
    assert texts("%%music\nset t") == ["time ", "tempo ", "transpose "]
    assert texts("%%music\nset s") == ["swing "]
    assert texts("%%music\nset g") == ["guitar.electric "]


def test_print_offers_musical_values_and_functions():
    cell = "%%music\nnotes melody = 1 3\nchords harmony = 1 5\nsteps rhythm = x---\n"
    assert "print(" in texts(cell + "pri")
    assert {"melody", "harmony", "rhythm", "fifth(", "notes ", "chords "} <= set(texts(cell + "print("))
    assert "fifth(" in texts(cell + "print(1, ")
    assert "harmony" in texts(cell + "print(chords ")
    assert "melody" not in texts(cell + "print(chords ")


def test_inside_braces_offers_instruments_and_patterns():
    cell = "%%music\npattern groove = { kick: x--x }\nplay block {\n  "
    assert {"kick: ", "ride.bell: ", "piano: ", "groove", "with ", "steps "} <= set(texts(cell))
    assert "set " not in texts(cell)  # inside braces, settings go on a with
    assert "chords: " not in texts(cell)  # chords go on their instrument's line
    assert texts(cell + "ri") == ["ride: ", "ride.bell: "]
    assert texts(cell + "gu") == ["guitar: ", "guitar.electric: "]
    assert texts(cell + "l") == []  # no loop: a pattern repeats by itself
    assert texts(cell + "(groove g") == ["groove"]
    assert texts(cell + "groove ") == []  # a line plays one thing
    assert texts(cell + "(groove ") == MORE  # a group plays them in order


def test_settings_offer_their_values():
    assert texts("%%music\nset kit ") == completer.KITS
    assert texts("%%music\nset kit s") == ["synth"]
    assert texts("%%music\nset time 7 ") == ["over "]
    assert texts("%%music\nset tempo ") == []
    assert texts("%%music\nset swing ") == completer.SWING
    assert texts("%%music\nset mode ") == completer.MODES
    assert texts("%%music\nset mode m") == ["major", "minor", "mixolydian", "melodicMinor"]
    assert texts("%%music\nset key ") == []
    assert texts("%%music\nset key D ") == []  # a key is a note, and its mode a setting of its own
    assert texts("%%music\nset guitar.electric ") == ["clean", "muted"]


def test_instrument_lines_offer_names_of_their_type():
    cell = "%%music\nsteps pair = ^-x-\nnotes riff = F---G---\nchords verse = Am F\nplay block {\n  "
    assert texts(cell + "hat: ") == ["pair"]
    assert texts(cell + "hat: p") == ["pair"]
    assert texts(cell + "snare: 2*pair p") == ["pair"]  # repeats compose with step names
    # Kit lines never suggest old length units or rest.
    assert texts(cell + "snare: 2 ") == ["pair"]
    assert texts(cell + "snare: 2 b") == []
    assert texts(cell + "snare: 2*pair ") == ["pair"]
    assert texts(cell + "snare: 8*- ") == ["pair"]
    # A pitched instrument's line says what it holds: notes, or a chart with chords in front.
    assert texts(cell + "piano: ") == ["notes ", "chords "]
    assert texts(cell + "piano: c") == ["chords "]
    assert texts(cell + "piano: notes ") == ["riff"] + FUNCTIONS
    assert texts(cell + "piano: chords ") == ["verse"] + FUNCTIONS
    assert texts(cell + "piano: chords Am ") == ["verse"] + FUNCTIONS
    assert texts(cell + "guitar.electric: notes F--- ") == ["riff"] + FUNCTIONS
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
    assert "kick: " in texts(cell + "--x-\n  },\n  ")  # closed: back to the pattern's lines
    assert texts("%%music\nsteps pair = ^-x-\nsteps ghosts = {\n  ") == ["pair"]
    assert texts("%%music\nsteps pair = ^-x-\nplay hat: {\n  ") == ["pair"]


def test_a_pitched_instruments_block_offers_notes_and_chords():
    cell = "%%music\nsteps pair = ^-x-\nnotes riff = F---G---\nchords verse = Am F\nplay piano: {\n  "
    assert texts(cell) == ["notes ", "chords "]
    assert texts(cell + "notes ") == ["riff"] + FUNCTIONS
    assert texts(cell + "chords ") == ["verse"] + FUNCTIONS
    assert texts(cell + "notes C4--- ") == ["riff"] + FUNCTIONS
    assert "kick: " in texts("%%music\nplay block {\n  piano: {\n    notes C4---\n  },\n  ")  # closed


def test_a_name_is_not_offered_inside_its_own_braces():
    assert "groove" not in texts("%%music\npattern groove = {\n  ")
    assert "groove" in texts("%%music\npattern groove = {\n  kick: x\n}\nplay ")


def test_bar_positions_follow_the_value():
    cell = "%%music\npattern lift = { hat.pedal: x- }\npattern groove = {\n  "
    assert "bar " not in texts(cell)
    assert texts(cell + "lift on ") == ["bar "]
    assert texts(cell + "lift on bar ") == []


def test_every_offers_units_then_what_plays():
    cell = "%%music\nsteps pair = x-x-\npattern lift = { hat.pedal: 4 }\npattern groove = {\n  "
    assert "every " in texts(cell)
    assert texts(cell + "ev") == ["every "]
    assert texts(cell + "every ") == []  # the number
    assert texts(cell + "every 3/4 ") == ["beats "]
    assert texts(cell + "every 3/4 beats ") == ["lift", *[p + ": " for p in completer.PARTS]]
    assert texts(cell + "every 3/4 beats kick: ") == ["pair"]
    assert texts("%%music\npattern feet = every 3/4 ") == ["beats "]


def test_play_offers_patterns_and_lengths():
    cell = "%%music\nsteps pair = x-x-\npattern groove = { kick: x--x }\n"
    assert texts(cell + "play ") == ["groove", *[p + ": " for p in completer.PARTS], "pattern ", "block "]
    assert texts(cell + "play 3 ") == []
    assert texts(cell + "play groove for 3 ") == ["bars "]
    assert texts(cell + "play (3 bars groove g") == ["groove"]


def test_a_line_plays_one_thing_and_a_group_plays_them_in_order():
    cell = "%%music\nsteps pair = x-x-\npattern groove = { kick: x--x }\n"
    # a line plays one thing; only its duration follows outside brackets
    assert texts(cell + "play groove ") == ["for ", "on bar "]
    assert texts(cell + "play groove for 3 bars ") == []
    assert texts(cell + "pattern song = groove ") == []
    assert texts(cell + "play block {\n  groove ") == []
    # in a group, what plays in order goes on
    assert texts(cell + "play (groove ") == MORE
    assert texts(cell + "play (groove g") == ["groove"]
    assert texts(cell + "play (groove 3 ") == ["bars "]
    assert texts(cell + "play (groove 3 bars ") == MORE
    assert texts(cell + "pattern song = (groove ") == MORE
    assert texts(cell + "play block {\n  (groove ") == MORE
    assert texts(cell + "play block {\n  1 bars (groove ") == MORE
    assert texts(cell + "play block {\n  every 1/2 beats (groove ") == MORE
    # a group starts with what plays: names, blocks, lines and withs
    parts = [p + ": " for p in completer.PARTS]
    assert texts(cell + "play (") == ["groove", *parts, "pattern ", "block ", "with "]
    # a group over several lines goes on with each line
    assert texts(cell + "play (\n  groove\n  ") == ["groove", *parts, "pattern ", "block ", "with "]
    assert texts(cell + "play (\n  groove ") == MORE


def test_after_a_block_or_a_group_more_follows_only_in_a_group():
    cell = "%%music\nsteps pair = x-x-\npattern groove = { kick: x--x }\n"
    assert texts(cell + "play block { kick: x } ") == []
    assert texts(cell + "play block { kick: x } for 3 bars ") == []
    assert texts(cell + "play block {\n  kick: x\n} ") == []
    assert texts(cell + "play block {\n  pattern { kick: x } ") == []
    assert texts(cell + "play block {\n  pattern { snare: x } on bar 2 ") == []
    assert texts(cell + "pattern song = { kick: x } ") == []
    assert texts(cell + "play (groove) ") == []
    assert texts(cell + "play (groove groove) for 4 bars ") == []
    assert texts(cell + "play block {\n  (groove groove) ") == []
    # in a group, more follows a block or a group
    assert texts(cell + "play (pattern { kick: x } ") == MORE
    assert texts(cell + "play ((groove groove) ") == MORE
    assert texts(cell + "play (pattern { kick: x } block { snare: x } ") == MORE
    # a length's arithmetic is not a group
    assert texts(cell + "play groove for (1+2) ") == ["bars "]
    assert texts(cell + "play groove for (1+2) bars ") == []
    # a kit piece's or an instrument's block is the whole of its line
    assert texts(cell + "play hat: {\n  x-\n} ") == []
    assert texts(cell + "play piano: {\n  notes C4---\n} ") == []
    assert texts(cell + "steps fig = {\n  x-\n} ") == []
    # and a new line starts again
    assert "play " in texts(cell + "play block { kick: x }\n")


def test_a_line_of_notes_takes_step_repeats():
    cell = "%%music\nnotes riff = F---\nplay block {\n  "
    assert texts(cell + "bass: notes 3 ") == ["riff"] + FUNCTIONS
    assert texts(cell + "bass: notes 7* ") == ["-", "_", "riff"] + FUNCTIONS
    assert texts(cell + "bass: notes 2*(C2 7*- ") == ["riff"] + FUNCTIONS


def test_a_degree_or_a_numeral_offers_functions():
    cell = "%%music\nnotes riff = F---\nchords verse = Am F\nplay block {\n  "
    assert texts(cell + "piano: notes biii ") == ["riff"] + FUNCTIONS
    assert texts(cell + "piano: notes C3 ") == ["riff"] + FUNCTIONS
    assert texts(cell + "piano: chords v7 ") == ["verse"] + FUNCTIONS
    assert texts(cell + "piano: chords Am ") == ["verse"] + FUNCTIONS


def test_a_type_offers_what_it_holds_after_the_equals():
    cell = "%%music\nsteps pair = ^-x-\nnotes riff = F---\nchords verse = Am F\npattern hit = { crash: 1 }\n"
    assert texts(cell + "steps ") == []  # still writing the name
    assert texts(cell + "steps four = ") == ["pair"]
    assert texts(cell + "notes line = ") == ["riff"] + FUNCTIONS
    assert texts(cell + "chords song = ") == ["verse"] + FUNCTIONS
    assert texts(cell + "pattern outro = ") == ["hit", *[p + ": " for p in completer.PARTS]]
    assert texts(cell + "pattern outro = 2 ") == ["bars "]
    assert texts(cell + "pattern outro = 2 bars h") == ["hit"]
    assert texts(cell + "pattern outro = (hit h") == ["hit"]
    assert texts(cell + "pattern fill = snare: ") == ["pair"]


def test_a_name_given_again_means_the_new_thing():
    cell = "%%music\nsteps riff = x-x-\nchords riff = Am F\nplay block {\n  "
    assert texts(cell + "piano: chords ") == ["riff"] + FUNCTIONS
    assert texts(cell + "hat: ") == []


def test_names_without_a_type_are_not_names_yet():
    assert texts("%%music\ngroove = { kick: x }\nplay gr") == []


def test_names_defined_below_the_cursor_are_not_offered():
    cell = "%%music\nplay \npattern later = { kick: x }"
    assert "later" not in [t for t, _ in complete(cell, len("%%music\nplay "))[1]]


def test_comments_offer_nothing():
    assert texts("%%music\n// t") == []


def test_magic_line_offers_after_and_saved_songs():
    songs = {"intro": Song("set tempo 75", name="intro")}
    assert complete("%%mus", 5) is None
    assert texts("%%music verse ", songs) == ["after "]
    assert texts("%%music verse after ", songs) == ["intro"]


def test_names_carry_on_from_the_song_a_cell_continues():
    songs = {"intro": Song("chords riff = Am E7|G D\npattern groove = { kick: x--x }", name="intro")}
    assert texts("%%music verse after intro\nplay piano: chords ", songs) == ["riff"] + FUNCTIONS
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
    assert kernel_completions(shell, "%%music\nplay block {\n  ride.") == [("", "bell: ")]
    assert sorted(kernel_completions(shell, "%%music\nplay block {\n  sn")) == [
        ("sn", "snare.cross: "),
        ("sn", "snare.ghost: "),
        ("sn", "snare.rim: "),
        ("sn", "snare: "),
    ]
    shell.run_cell_magic("music", "intro", "set tempo 75")
    assert kernel_completions(shell, "%%music verse after in") == [("in", "intro")]


def test_ipython_keeps_python_names_out_of_music_cells(shell):
    # Python's pass and bare print must not leak into music completions.
    assert kernel_completions(shell, "%%music\np") == [
        ("p", "pattern "),
        ("p", "play "),
        ("p", "print("),
    ]


@pytest.mark.parametrize("cell", ["%%music\nset tempo ", "%%music\nplay block {\n  kick: x--- ", "%%music\n// i"])
def test_ipython_offers_nothing_where_music_has_nothing(shell, cell):
    assert kernel_completions(shell, cell) == []


def test_ipython_still_completes_the_magic_name(shell):
    assert ("%%mus", "%%music") in kernel_completions(shell, "%%mus")


def test_python_cells_are_left_alone(shell):
    assert ("pri", "print") in kernel_completions(shell, "pri")


def test_with_offers_settings_then_their_values():
    assert texts("%%music\nwith ") == texts("%%music\nset ")
    assert texts("%%music\nwith key E, ") == texts("%%music\nset ")
    assert texts("%%music\nwith key E, mode ") == completer.MODES
    assert texts("%%music\nwith octave 2, k") == ["key ", "kit "]
    assert texts("%%music\nplay block {\n  with mode d") == ["dorian"]


def test_a_with_at_the_top_holds_statements_without_set():
    cell = "%%music\nwith key E {\n  "
    assert {"play ", "with ", "chords "} <= set(texts(cell))
    assert "set " not in texts(cell)
    assert "kick: " not in texts(cell)
    # a play inside it holds lines, as any play does
    assert "kick: " in texts(cell + "play block {\n    ")


def test_interval_functions_and_compound_degrees():
    table = re.search(r"^export const INTERVALS = \{\n(.*?)^\}", VOCAB_TS.read_text(), re.M | re.S)
    assert completer.INTERVALS == re.findall(r"^  (\w+):", table.group(1), re.M)
    cell = "%%music\nnotes riff = 1---8---\nchords harmony = 1 15\n"
    assert texts(cell + "play piano: notes fif") == ["fifth(", "fifteenth("]
    assert texts(cell + "notes answer = oct") == ["octave("]
    assert "riff" in texts(cell + "notes answer = fifth(")
    assert "harmony" in texts(cell + "play piano: chords fifth(")
    assert "of " not in texts(cell + "play piano: notes 15 ")
    assert "of " not in texts(cell + "play piano: chords 15 ")
    assert "of " not in texts(cell + "play piano: notes -1 ")
    assert "of " not in texts(cell + "play piano: chords -1sus2 ")
    assert "fifth(" not in texts(cell + "play kick: ")


def test_comma_entries_keep_with_settings_and_note_arguments():
    assert "snare: " in texts("%%music\nplay block { kick: x-, ")
    assert "hat: " in texts("%%music\nplay block { with octave 2 { bass: notes -1, }, ")
    assert texts("%%music\nplay block { with key D, mode ") == completer.MODES
    assert "fifth(" in texts("%%music\nplay block { piano: notes 2*(1 7*- ")
    assert "snare: " not in texts("%%music\nplay block { piano: notes 2*(1 7*- ")
    assert "hat: " in texts("%%music\nplay block { piano: notes fifth(1, -1), ")
