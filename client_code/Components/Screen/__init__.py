from anvil import *
from anvil.js import window

from ._anvil_designer import ScreenTemplate
from ... import nv


class Screen(ScreenTemplate):
    """An editor engine (nv-editor.js) in a page: UI.mountScreen(name, element, args) on show, destroy() on hide.
    The engine draws its own markup, autosaves through UI.api (nv.py's bridge) and shows its own dialogs (UI.modal)."""

    def __init__(self, **properties):
        self.screen = ""
        self._args = []
        self.ctl = nv.NULL
        super().__init__(**properties)

    def mount(self, args):
        self._args = [str(a) for a in (args or [])]

    @handle("", "show")
    def form_show(self, **event_args):
        self.destroy()
        self.ctl = window.UI.mountScreen(self.screen, self.dom_nodes["host"], nv.js_value(self._args))

    @handle("", "hide")
    def form_hide(self, **event_args):
        self.destroy()

    def destroy(self):
        if self.ctl is not None:
            self.ctl.destroy()
            self.ctl = nv.NULL
