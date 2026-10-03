from pathlib import Path

import anywidget
import traitlets

_STATIC = Path(__file__).parent / "static"


class MusicWidget(anywidget.AnyWidget):
    """Notebook player for composer-nb source.

    `sources` is a chain of cell sources: the last one is played, and each
    earlier one only hands its settings (key, tempo, instrument, ...) forward.
    Parsing and audio both happen in the browser, in the same engine the
    playground uses.
    """

    _esm = _STATIC / "widget.js"
    _css = _STATIC / "widget.css"

    sources = traitlets.List(traitlets.Unicode()).tag(sync=True)
    name = traitlets.Unicode("").tag(sync=True)
    after = traitlets.Unicode("").tag(sync=True)
