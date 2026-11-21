from anvil import *
from anvil.js import window

from ._anvil_designer import PlayerTemplate
from ... import nv


class Player(PlayerTemplate):
    """The visual novel player in a page: NV.mount(host, story, opts) from theme/assets/nv-runtime.js (title screen,
    saves, rollback, endings, gallery, mini-games, music). The player keeps its saves in this browser
    (localStorage nvp:<storage key>)."""

    def __init__(self, **properties):
        self.player = nv.NULL
        self._hooks = {}
        super().__init__(**properties)

    def play(self, data, storage_key, title="", author="", on_start=None, on_ending=None, on_choice=None, choice_pcts=None):
        """choice_pcts: {choice id: percent of readers} for "38% of readers chose this" after each pick (or None)."""
        self.stop()
        self._hooks = {"start": on_start, "ending": on_ending, "choice": on_choice}
        opts = nv.js_value({"storageKey": storage_key, "meta": {"title": title, "author": author}, "branding": False,
                            "choicePcts": choice_pcts or {}})
        opts.resolve = window.NVT.img
        opts.onStart = self._started
        opts.onEnding = self._ended
        opts.onChoice = self._chose
        self.player = window.NV.mount(self.dom_nodes["host"], nv.js_value(data), opts)

    def _started(self, *args):
        fn = self._hooks.get("start")
        if fn:
            fn()

    def _ended(self, scene_id=None, *args):
        fn = self._hooks.get("ending")
        if fn:
            fn(scene_id)

    def _chose(self, choice_id=None, *args):
        fn = self._hooks.get("choice")
        if fn:
            fn(choice_id)

    def stop(self):
        if self.player is not None:
            self.player.destroy()
            self.player = nv.NULL

    @handle("", "hide")
    def form_hide(self, **event_args):
        self.stop()
