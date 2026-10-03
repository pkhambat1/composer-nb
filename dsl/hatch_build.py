"""Stop a build that would ship without the widget's JavaScript.

The widget is compiled by `npm run build -w dsl` into python/composer_nb/static/,
which git ignores. Without this check, forgetting that step produces a wheel
that installs fine but shows nothing in the notebook.
"""

from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        static = Path(self.root) / "python" / "composer_nb" / "static"
        missing = [name for name in ("widget.js", "widget.css") if not (static / name).is_file()]
        if missing:
            raise RuntimeError(
                f"{', '.join(missing)} missing from {static}. "
                "Build the widget first: npm run build -w dsl"
            )
