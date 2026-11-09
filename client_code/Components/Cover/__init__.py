from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import CoverTemplate
from ... import nv


class Cover(CoverTemplate):
    """A novel's cover (2:3): the cover picture, the title over it unless the picture already has one, and an optional
    Featured badge. Drawn by NVT.coverHtml (theme/assets/nv-tools.js), the same markup the editor uses."""

    def __init__(self, **properties):
        self._story = None
        self._badge = False
        self._ready = False
        super().__init__(**properties)
        self._ready = True
        self._draw()

    def _draw(self):
        if not (self._ready and self._story):
            return
        badge = ""
        if self._badge and self._story.get("featured"):
            badge = '<span class="ui-badge brand">' + str(window.UI.icon("star")) + "Featured</span>"
        anvil.js.get_dom_node(self).innerHTML = str(window.NVT.coverHtml(nv.js_value(self._story), badge))

    @property
    def story(self):
        return self._story

    @story.setter
    def story(self, value):
        self._story = value
        self._draw()

    @property
    def featured_badge(self):
        return self._badge

    @featured_badge.setter
    def featured_badge(self, value):
        self._badge = bool(value)
        self._draw()
