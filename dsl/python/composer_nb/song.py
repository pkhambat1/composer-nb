from typing import List, Optional

from .widget import MusicWidget


class Song:
    """A cell's worth of composer-nb source.

    Pass `after` to start from the settings another song ended on (key, tempo,
    instrument, ...). The link is to that song object, not to whichever cell
    sits above, so moving cells around or running them out of order doesn't
    change what a song sounds like.

        intro = Song("@key Am\\n@tempo 75\\nAm E7\\nG D", name="intro")
        verse = Song("F C\\nDm E7", after=intro, name="verse")
    """

    def __init__(self, source: str, *, after: Optional["Song"] = None, name: Optional[str] = None):
        if not isinstance(source, str):
            raise TypeError(f"source must be a str, not {type(source).__name__}")
        if after is not None and not isinstance(after, Song):
            raise TypeError(f"after must be a Song, not {type(after).__name__}")
        self.source = source
        self.after = after
        self.name = name

    @property
    def chain(self) -> List[str]:
        """Sources from the start of the `after` chain down to this song."""
        sources = []
        seen = set()
        song = self
        while song is not None:
            if id(song) in seen:
                raise ValueError("songs can't continue from each other in a loop")
            seen.add(id(song))
            sources.append(song.source)
            song = song.after
        return sources[::-1]

    def widget(self) -> MusicWidget:
        """The notebook player for this song."""
        return MusicWidget(
            sources=self.chain,
            name=self.name or "",
            after=(self.after.name or "") if self.after else "",
        )

    def _repr_mimebundle_(self, include=None, exclude=None):
        bundle = self.widget()._repr_mimebundle_(include=include, exclude=exclude)
        data, metadata = bundle if isinstance(bundle, tuple) else (bundle, {})
        # Terminals and plain-text renderers get the song, not "<MusicWidget object at ...>".
        return {**data, "text/plain": repr(self)}, metadata

    def __repr__(self):
        parts = [repr(self.name)] if self.name else []
        if self.after is not None:
            parts.append(f"after={self.after.name or 'Song(...)'}")
        return f"Song({', '.join(parts)})"
