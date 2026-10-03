import keyword
from typing import Optional, Tuple

from IPython.core.error import UsageError
from IPython.core.magic import Magics, cell_magic, magics_class

from .song import Song

USAGE = "Usage: %%music [name] [after <name>]"


def parse_magic_line(line: str) -> Tuple[Optional[str], Optional[str]]:
    """Split the `%%music` line into (name, after)."""
    words = line.split()
    name = after = None
    if words and words[0] != "after":
        name = words.pop(0)
    if words:
        if words[0] != "after" or len(words) != 2:
            raise UsageError(USAGE)
        after = words[1]
    for word in (name, after):
        if word is not None and (not word.isidentifier() or keyword.iskeyword(word)):
            raise UsageError(
                f"{word!r} can't be a cell name. Use letters, digits and underscores, like intro or verse_2."
            )
    if name is not None and name == after:
        raise UsageError(f"{name} can't continue from itself.")
    return name, after


@magics_class
class MusicMagics(Magics):
    @cell_magic
    def music(self, line, cell):
        """Play a cell of composer-nb source.

        %%music                    play this cell on its own
        %%music intro              ...and save it as `intro`
        %%music verse after intro  start from the settings `intro` ended on
        """
        name, after_name = parse_magic_line(line)
        after = None
        if after_name is not None:
            if after_name not in self.shell.user_ns:
                raise UsageError(f"{after_name} hasn't been run yet. Run its cell first.")
            after = self.shell.user_ns[after_name]
            if not isinstance(after, Song):
                raise UsageError(f"{after_name} is a {type(after).__name__}, not a %%music cell.")
        song = Song(cell, after=after, name=name)
        if name is not None:
            self.shell.user_ns[name] = song
        return song
