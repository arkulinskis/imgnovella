from anvil import *
import anvil.js

from ._anvil_designer import GuideTemplate


class Guide(GuideTemplate):
    """#guide: how ImgNovella works (scenes, steps, choices, mini-games, music, variables and conditions, text tags,
    what readers get, coming from Ren'Py, selling). Static copy in the template; the mini-game table lists
    NV.GAMES from theme/assets/nv-runtime.js as it was when the page was written (update it with a new game)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)

    def jump_click(self, event):
        event.preventDefault()
        key = event.currentTarget.getAttribute("data-jump")
        el = anvil.js.get_dom_node(self).querySelector("#g-" + key)
        if el:
            el.scrollIntoView({"behavior": "smooth"})
