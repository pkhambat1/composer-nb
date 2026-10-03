import pytest
from IPython.core.error import UsageError
from IPython.core.interactiveshell import InteractiveShell

from composer_nb import Song
from composer_nb.magic import parse_magic_line


@pytest.mark.parametrize(
    "line, expected",
    [
        ("", (None, None)),
        ("intro", ("intro", None)),
        ("verse after intro", ("verse", "intro")),
        ("after intro", (None, "intro")),
        ("  verse   after   intro  ", ("verse", "intro")),
    ],
)
def test_parse_magic_line(line, expected):
    assert parse_magic_line(line) == expected


@pytest.mark.parametrize(
    "line", ["verse after", "after", "verse intro", "verse after intro extra", "a b c"]
)
def test_parse_magic_line_rejects_bad_shapes(line):
    with pytest.raises(UsageError, match="Usage"):
        parse_magic_line(line)


@pytest.mark.parametrize("line", ["2nd", "verse-2", "class", "verse after for"])
def test_parse_magic_line_rejects_bad_names(line):
    with pytest.raises(UsageError, match="can't be a cell name"):
        parse_magic_line(line)


def test_parse_magic_line_rejects_self_reference():
    with pytest.raises(UsageError, match="itself"):
        parse_magic_line("intro after intro")


@pytest.fixture
def shell():
    shell = InteractiveShell.instance()
    shell.run_line_magic("load_ext", "composer_nb")
    yield shell
    shell.user_ns.pop("intro", None)
    shell.user_ns.pop("verse", None)
    shell.user_ns.pop("not_music", None)


def test_named_cell_is_saved(shell):
    song = shell.run_cell_magic("music", "intro", "key D\nplay chords: I IV")
    assert isinstance(song, Song)
    assert shell.user_ns["intro"] is song


def test_after_links_to_the_named_song(shell):
    intro = shell.run_cell_magic("music", "intro", "key D")
    verse = shell.run_cell_magic("music", "verse after intro", "play chords: I IV")
    assert verse.after is intro
    assert verse.chain == ["key D", "play chords: I IV"]


def test_anonymous_cell_is_not_saved(shell):
    before = set(shell.user_ns)
    shell.run_cell_magic("music", "", "C F G")
    assert set(shell.user_ns) == before


def test_after_a_cell_that_has_not_run(shell):
    with pytest.raises(UsageError, match="hasn't been run yet"):
        shell.run_cell_magic("music", "verse after intro", "C")


def test_after_something_that_is_not_music(shell):
    shell.user_ns["not_music"] = 42
    with pytest.raises(UsageError, match="not a %%music cell"):
        shell.run_cell_magic("music", "verse after not_music", "C")
