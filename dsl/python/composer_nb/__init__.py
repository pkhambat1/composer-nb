"""composer-nb: a small language for chords and drums, played inside notebooks.

In Jupyter, load the cell magic and write music in `%%music` cells:

    %load_ext composer_nb

    %%music intro
    tempo 75
    sound guitar
    play {
      chords: Am E7|G D
      kick: loop x-------
      snare: loop ----x---
    }

Or build songs from Python with `Song`.
"""

from importlib.metadata import PackageNotFoundError, version

from .song import Song
from .widget import MusicWidget

try:
    __version__ = version("composer-nb")
except PackageNotFoundError:  # running from a source checkout that isn't installed
    __version__ = "0.0.0"

__all__ = ["MusicWidget", "Song", "__version__"]


def load_ipython_extension(ipython):
    """Called by `%load_ext composer_nb`; registers the `%%music` cell magic and its Tab completion."""
    from .completer import register
    from .magic import MusicMagics

    ipython.register_magics(MusicMagics)
    register(ipython)
