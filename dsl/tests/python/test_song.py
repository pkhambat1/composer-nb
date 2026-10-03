import pytest

from composer_nb import MusicWidget, Song


def test_chain_runs_from_first_song_to_last():
    intro = Song("@key Bm", name="intro")
    verse = Song("@tempo 120", after=intro, name="verse")
    chorus = Song("G D", after=verse)
    assert chorus.chain == ["@key Bm", "@tempo 120", "G D"]


def test_song_on_its_own_is_a_chain_of_one():
    assert Song("C F G").chain == ["C F G"]


def test_widget_carries_chain_and_names():
    intro = Song("@key Bm", name="intro")
    widget = Song("G D", after=intro, name="verse").widget()
    assert isinstance(widget, MusicWidget)
    assert widget.sources == ["@key Bm", "G D"]
    assert widget.name == "verse"
    assert widget.after == "intro"


def test_displays_as_a_notebook_widget():
    data, _ = Song("C F G", name="riff")._repr_mimebundle_()
    assert "application/vnd.jupyter.widget-view+json" in data
    assert data["text/plain"] == "Song('riff')"


def test_repr_names_what_it_follows():
    intro = Song("@key Am", name="intro")
    assert repr(Song("C", after=intro, name="verse")) == "Song('verse', after=intro)"
    assert repr(Song("C")) == "Song()"


def test_rejects_after_that_is_not_a_song():
    with pytest.raises(TypeError, match="after must be a Song"):
        Song("C", after="intro")


def test_rejects_loops():
    a = Song("C", name="a")
    b = Song("F", after=a, name="b")
    a.after = b
    with pytest.raises(ValueError, match="loop"):
        b.chain
